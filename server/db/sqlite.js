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
        CREATE TABLE IF NOT EXISTS events (
          id          TEXT PRIMARY KEY,
          name        TEXT NOT NULL,
          host_name   TEXT,
          admin_token TEXT NOT NULL,
          created_at  INTEGER NOT NULL,
          photo_count INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS photos (
          id         TEXT PRIMARY KEY,
          event_id   TEXT NOT NULL,
          guest_name TEXT,
          filter     TEXT,
          width      INTEGER,
          height     INTEGER,
          bytes      INTEGER,
          full_key   TEXT,
          thumb_key  TEXT,
          created_at INTEGER NOT NULL,
          FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_photos_event_created
          ON photos (event_id, created_at DESC);
      `);

      stmts = {
        insertEvent: db.prepare(
          `INSERT INTO events (id, name, host_name, admin_token, created_at)
           VALUES (@id, @name, @host_name, @admin_token, @created_at)`
        ),
        getEvent: db.prepare(`SELECT * FROM events WHERE id = ?`),
        insertPhoto: db.prepare(
          `INSERT INTO photos (id, event_id, guest_name, filter, width, height, bytes, full_key, thumb_key, created_at)
           VALUES (@id, @event_id, @guest_name, @filter, @width, @height, @bytes, @full_key, @thumb_key, @created_at)`
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

    async listPhotos(eventId, before, limit) {
      return db
        .prepare(
          `SELECT * FROM photos
           WHERE event_id = ? AND created_at < ?
           ORDER BY created_at DESC
           LIMIT ?`
        )
        .all(eventId, before, limit);
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
  };
}
