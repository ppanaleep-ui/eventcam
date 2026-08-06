import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { config } from '../config.js';

/*
 * SQLite repository (default). better-sqlite3 is synchronous; we wrap every
 * method in async so the repository interface is identical to the Postgres one
 * and routes can `await` regardless of which backend is active.
 */

let db;
let stmts;

export function createSqliteRepo() {
  return {
    async init() {
      fs.mkdirSync(config.dataDir, { recursive: true });
      db = new Database(path.join(config.dataDir, 'eventcam.db'));
      db.pragma('journal_mode = WAL'); // concurrent readers alongside a writer
      db.pragma('synchronous = NORMAL');
      db.pragma('foreign_keys = ON');
      db.pragma('busy_timeout = 5000');

      db.exec(`
        CREATE TABLE IF NOT EXISTS users (
          id            TEXT PRIMARY KEY,
          email         TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          name          TEXT,
          role          TEXT NOT NULL DEFAULT 'user',
          status        TEXT NOT NULL DEFAULT 'pending',
          created_at    INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS events (
          id            TEXT PRIMARY KEY,
          name          TEXT NOT NULL,
          host_name     TEXT,
          admin_token   TEXT NOT NULL,
          owner_user_id TEXT,
          created_at    INTEGER NOT NULL,
          photo_count   INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS photos (
          id         TEXT PRIMARY KEY,
          event_id   TEXT NOT NULL,
          guest_name TEXT,
          owner_id   TEXT,
          kind       TEXT NOT NULL DEFAULT 'photo',
          filter     TEXT,
          width      INTEGER,
          height     INTEGER,
          duration   INTEGER,
          bytes      INTEGER,
          full_key   TEXT,
          thumb_key  TEXT,
          hidden     INTEGER NOT NULL DEFAULT 0,
          like_count INTEGER NOT NULL DEFAULT 0,
          comment_count INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL,
          FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_photos_event_created
          ON photos (event_id, created_at DESC);
        CREATE TABLE IF NOT EXISTS likes (
          photo_id TEXT NOT NULL,
          guest_id TEXT NOT NULL,
          PRIMARY KEY (photo_id, guest_id),
          FOREIGN KEY (photo_id) REFERENCES photos(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS comments (
          id         TEXT PRIMARY KEY,
          photo_id   TEXT NOT NULL,
          event_id   TEXT NOT NULL,
          guest_id   TEXT,
          name       TEXT,
          text       TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          FOREIGN KEY (photo_id) REFERENCES photos(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_comments_photo ON comments (photo_id, created_at ASC);
      `);

      // Migrate databases created before these columns existed.
      const cols = new Set(db.prepare(`PRAGMA table_info(photos)`).all().map((c) => c.name));
      const addCol = (name, decl) => {
        if (!cols.has(name)) db.exec(`ALTER TABLE photos ADD COLUMN ${name} ${decl}`);
      };
      addCol('owner_id', 'TEXT');
      addCol('kind', "TEXT NOT NULL DEFAULT 'photo'");
      addCol('duration', 'INTEGER');
      addCol('hidden', 'INTEGER NOT NULL DEFAULT 0');
      addCol('like_count', 'INTEGER NOT NULL DEFAULT 0');
      addCol('comment_count', 'INTEGER NOT NULL DEFAULT 0');
      // Migrate events for account ownership.
      const eCols = new Set(db.prepare(`PRAGMA table_info(events)`).all().map((c) => c.name));
      if (!eCols.has('owner_user_id')) db.exec(`ALTER TABLE events ADD COLUMN owner_user_id TEXT`);

      stmts = {
        insertEvent: db.prepare(
          `INSERT INTO events (id, name, host_name, admin_token, owner_user_id, created_at)
           VALUES (@id, @name, @host_name, @admin_token, @owner_user_id, @created_at)`
        ),
        getEvent: db.prepare(`SELECT * FROM events WHERE id = ?`),
        insertPhoto: db.prepare(
          `INSERT INTO photos (id, event_id, guest_name, owner_id, kind, filter, width, height, duration, bytes, full_key, thumb_key, hidden, created_at)
           VALUES (@id, @event_id, @guest_name, @owner_id, @kind, @filter, @width, @height, @duration, @bytes, @full_key, @thumb_key, @hidden, @created_at)`
        ),
        bump: db.prepare(`UPDATE events SET photo_count = photo_count + 1 WHERE id = ?`),
        dec: db.prepare(
          `UPDATE events SET photo_count = MAX(0, photo_count - 1) WHERE id = ?`
        ),
        getPhoto: db.prepare(`SELECT * FROM photos WHERE event_id = ? AND id = ?`),
        deletePhoto: db.prepare(`DELETE FROM photos WHERE event_id = ? AND id = ?`),
        listAll: db.prepare(
          `SELECT * FROM photos WHERE event_id = ? ORDER BY created_at ASC`
        ),
      };
    },

    async createEvent(e) {
      stmts.insertEvent.run(e);
    },

    async getEvent(id) {
      return stmts.getEvent.get(id) || null;
    },

    async insertPhotoAndBump(photo) {
      db.transaction(() => {
        stmts.insertPhoto.run(photo);
        stmts.bump.run(photo.event_id);
      })();
    },

    async listPhotos(eventId, before, limit, viewer = {}) {
      // Non-hosts see public photos + their own hidden ones; hosts see all.
      const vid = viewer.viewerId || '';
      const params = [vid, eventId, before]; // first ? is for the `liked` subquery
      let where = `event_id = ? AND created_at < ?`;
      if (!viewer.isHost) {
        where += ` AND (hidden = 0 OR owner_id = ?)`;
        params.push(vid);
      }
      params.push(limit);
      return db
        .prepare(
          `SELECT *, EXISTS(SELECT 1 FROM likes l WHERE l.photo_id = photos.id AND l.guest_id = ?) AS liked
           FROM photos WHERE ${where} ORDER BY created_at DESC LIMIT ?`
        )
        .all(...params);
    },

    async getPhoto(eventId, photoId) {
      return stmts.getPhoto.get(eventId, photoId) || null;
    },

    async deletePhotoAndDec(eventId, photoId) {
      return db.transaction(() => {
        const row = stmts.getPhoto.get(eventId, photoId);
        if (!row) return null;
        stmts.deletePhoto.run(eventId, photoId);
        stmts.dec.run(eventId);
        return row;
      })();
    },

    async listAllPhotos(eventId) {
      return stmts.listAll.all(eventId);
    },

    async renameEvent(id, name) {
      db.prepare(`UPDATE events SET name = ? WHERE id = ?`).run(name, id);
    },

    async deleteEvent(id) {
      db.prepare(`DELETE FROM events WHERE id = ?`).run(id); // photos cascade
    },

    async listEventsByOwner(userId) {
      return db
        .prepare(`SELECT * FROM events WHERE owner_user_id = ? ORDER BY created_at DESC`)
        .all(userId);
    },

    // ---- users ----
    async createUser(u) {
      db.prepare(
        `INSERT INTO users (id, email, password_hash, name, role, status, created_at)
         VALUES (@id, @email, @password_hash, @name, @role, @status, @created_at)`
      ).run(u);
    },
    async getUserByEmail(email) {
      return db.prepare(`SELECT * FROM users WHERE email = ?`).get(email) || null;
    },
    async getUserById(id) {
      return db.prepare(`SELECT * FROM users WHERE id = ?`).get(id) || null;
    },
    async listUsers() {
      return db.prepare(`SELECT * FROM users ORDER BY created_at DESC`).all();
    },
    async setUserStatus(id, status) {
      db.prepare(`UPDATE users SET status = ? WHERE id = ?`).run(status, id);
    },
    async setUserRole(id, role) {
      db.prepare(`UPDATE users SET role = ? WHERE id = ?`).run(role, id);
    },

    // ---- likes / comments ----
    async toggleLike(photoId, guestId) {
      return db.transaction(() => {
        const has = db.prepare(`SELECT 1 FROM likes WHERE photo_id = ? AND guest_id = ?`).get(photoId, guestId);
        if (has) {
          db.prepare(`DELETE FROM likes WHERE photo_id = ? AND guest_id = ?`).run(photoId, guestId);
          db.prepare(`UPDATE photos SET like_count = MAX(0, like_count - 1) WHERE id = ?`).run(photoId);
        } else {
          db.prepare(`INSERT INTO likes (photo_id, guest_id) VALUES (?, ?)`).run(photoId, guestId);
          db.prepare(`UPDATE photos SET like_count = like_count + 1 WHERE id = ?`).run(photoId);
        }
        const row = db.prepare(`SELECT like_count FROM photos WHERE id = ?`).get(photoId);
        return { liked: !has, likeCount: row ? row.like_count : 0 };
      })();
    },
    async addComment(c) {
      db.transaction(() => {
        db.prepare(
          `INSERT INTO comments (id, photo_id, event_id, guest_id, name, text, created_at)
           VALUES (@id, @photo_id, @event_id, @guest_id, @name, @text, @created_at)`
        ).run(c);
        db.prepare(`UPDATE photos SET comment_count = comment_count + 1 WHERE id = ?`).run(c.photo_id);
      })();
      const row = db.prepare(`SELECT comment_count FROM photos WHERE id = ?`).get(c.photo_id);
      return row ? row.comment_count : 0;
    },
    async listComments(photoId) {
      return db.prepare(`SELECT * FROM comments WHERE photo_id = ? ORDER BY created_at ASC`).all(photoId);
    },
  };
}
