import { config } from '../config.js';

/*
 * Postgres repository. Same interface as the SQLite one, so routes don't care
 * which is active. `pg` is imported dynamically so the dependency is only
 * touched when DATABASE_URL is configured.
 *
 * created_at is stored as BIGINT milliseconds (matching SQLite) to keep the
 * keyset pagination and DTO shape identical across backends.
 */

export async function createPostgresRepo() {
  const { default: pg } = await import('pg');
  const pool = new pg.Pool({
    connectionString: config.databaseUrl,
    max: Number(process.env.PG_POOL_MAX || 10),
    ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined,
  });

  const q = (text, params) => pool.query(text, params);

  return {
    async init() {
      await q(`
        CREATE TABLE IF NOT EXISTS users (
          id            TEXT PRIMARY KEY,
          email         TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          name          TEXT,
          role          TEXT NOT NULL DEFAULT 'user',
          status        TEXT NOT NULL DEFAULT 'pending',
          created_at    BIGINT NOT NULL
        );
      `);
      await q(`
        CREATE TABLE IF NOT EXISTS events (
          id          TEXT PRIMARY KEY,
          name        TEXT NOT NULL,
          host_name   TEXT,
          admin_token TEXT NOT NULL,
          created_at  BIGINT NOT NULL,
          photo_count INTEGER NOT NULL DEFAULT 0
        );
      `);
      await q(`ALTER TABLE events ADD COLUMN IF NOT EXISTS owner_user_id TEXT`);
      await q(`ALTER TABLE events ADD COLUMN IF NOT EXISTS default_filter TEXT`);
      await q(`ALTER TABLE events ADD COLUMN IF NOT EXISTS guests_can_view INTEGER NOT NULL DEFAULT 1`);
      await q(`ALTER TABLE events ADD COLUMN IF NOT EXISTS reveal TEXT NOT NULL DEFAULT 'instant'`);
      await q(`ALTER TABLE events ADD COLUMN IF NOT EXISTS ends_at BIGINT`);
      await q(`
        CREATE TABLE IF NOT EXISTS photos (
          id         TEXT PRIMARY KEY,
          event_id   TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
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
          created_at BIGINT NOT NULL
        );
      `);
      // Migrate databases created before these columns existed.
      await q(`ALTER TABLE photos ADD COLUMN IF NOT EXISTS owner_id TEXT`);
      await q(`ALTER TABLE photos ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'photo'`);
      await q(`ALTER TABLE photos ADD COLUMN IF NOT EXISTS duration INTEGER`);
      await q(`ALTER TABLE photos ADD COLUMN IF NOT EXISTS hidden INTEGER NOT NULL DEFAULT 0`);
      await q(`ALTER TABLE photos ADD COLUMN IF NOT EXISTS like_count INTEGER NOT NULL DEFAULT 0`);
      await q(`ALTER TABLE photos ADD COLUMN IF NOT EXISTS comment_count INTEGER NOT NULL DEFAULT 0`);
      await q(`
        CREATE TABLE IF NOT EXISTS likes (
          photo_id TEXT NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
          guest_id TEXT NOT NULL,
          PRIMARY KEY (photo_id, guest_id)
        );
      `);
      await q(`
        CREATE TABLE IF NOT EXISTS comments (
          id         TEXT PRIMARY KEY,
          photo_id   TEXT NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
          event_id   TEXT NOT NULL,
          guest_id   TEXT,
          name       TEXT,
          text       TEXT NOT NULL,
          created_at BIGINT NOT NULL
        );
      `);
      await q(`CREATE INDEX IF NOT EXISTS idx_comments_photo ON comments (photo_id, created_at ASC)`);
      await q(
        `CREATE INDEX IF NOT EXISTS idx_photos_event_created
           ON photos (event_id, created_at DESC);`
      );
    },

    async createEvent(e) {
      await q(
        `INSERT INTO events (id, name, host_name, admin_token, owner_user_id, created_at, default_filter, guests_can_view, reveal, ends_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [e.id, e.name, e.host_name, e.admin_token, e.owner_user_id, e.created_at, e.default_filter, e.guests_can_view, e.reveal, e.ends_at]
      );
    },

    async getEvent(id) {
      const { rows } = await q(`SELECT * FROM events WHERE id = $1`, [id]);
      return rows[0] || null;
    },

    async insertPhotoAndBump(p) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          `INSERT INTO photos (id, event_id, guest_name, owner_id, kind, filter, width, height, duration, bytes, full_key, thumb_key, hidden, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
          [p.id, p.event_id, p.guest_name, p.owner_id, p.kind, p.filter, p.width, p.height, p.duration, p.bytes, p.full_key, p.thumb_key, p.hidden, p.created_at]
        );
        await client.query(`UPDATE events SET photo_count = photo_count + 1 WHERE id = $1`, [p.event_id]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    },

    async listPhotos(eventId, before, limit, viewer = {}) {
      const vid = viewer.viewerId || '';
      const params = [vid, eventId, before]; // $1 = viewer id for the `liked` subquery
      let where = `event_id = $2 AND created_at < $3`;
      if (!viewer.isHost) {
        params.push(vid);
        where += ` AND (hidden = 0 OR owner_id = $${params.length})`;
      }
      params.push(limit);
      const { rows } = await q(
        `SELECT *, EXISTS(SELECT 1 FROM likes l WHERE l.photo_id = photos.id AND l.guest_id = $1) AS liked
         FROM photos WHERE ${where} ORDER BY created_at DESC LIMIT $${params.length}`,
        params
      );
      return rows;
    },

    async getPhoto(eventId, photoId) {
      const { rows } = await q(`SELECT * FROM photos WHERE event_id = $1 AND id = $2`, [eventId, photoId]);
      return rows[0] || null;
    },

    async deletePhotoAndDec(eventId, photoId) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const { rows } = await client.query(
          `DELETE FROM photos WHERE event_id = $1 AND id = $2 RETURNING *`,
          [eventId, photoId]
        );
        if (rows[0]) {
          await client.query(
            `UPDATE events SET photo_count = GREATEST(0, photo_count - 1) WHERE id = $1`,
            [eventId]
          );
        }
        await client.query('COMMIT');
        return rows[0] || null;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    },

    async setPhotoHidden(eventId, photoId, hidden) {
      const { rowCount } = await q(
        `UPDATE photos SET hidden = $1 WHERE event_id = $2 AND id = $3`,
        [hidden ? 1 : 0, eventId, photoId]
      );
      return rowCount > 0;
    },

    async listAllPhotos(eventId) {
      const { rows } = await q(
        `SELECT * FROM photos WHERE event_id = $1 ORDER BY created_at ASC`,
        [eventId]
      );
      return rows;
    },

    async renameEvent(id, name) {
      await q(`UPDATE events SET name = $1 WHERE id = $2`, [name, id]);
    },
    async updateEventSettings(id, s) {
      await q(
        `UPDATE events SET name = $1, default_filter = $2, guests_can_view = $3, reveal = $4, ends_at = $5 WHERE id = $6`,
        [s.name, s.default_filter, s.guests_can_view, s.reveal, s.ends_at, id]
      );
    },

    async deleteEvent(id) {
      await q(`DELETE FROM events WHERE id = $1`, [id]); // photos cascade
    },

    async listEventsByOwner(userId) {
      const { rows } = await q(
        `SELECT * FROM events WHERE owner_user_id = $1 ORDER BY created_at DESC`,
        [userId]
      );
      return rows;
    },

    // ---- users ----
    async createUser(u) {
      await q(
        `INSERT INTO users (id, email, password_hash, name, role, status, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [u.id, u.email, u.password_hash, u.name, u.role, u.status, u.created_at]
      );
    },
    async getUserByEmail(email) {
      const { rows } = await q(`SELECT * FROM users WHERE email = $1`, [email]);
      return rows[0] || null;
    },
    async getUserById(id) {
      const { rows } = await q(`SELECT * FROM users WHERE id = $1`, [id]);
      return rows[0] || null;
    },
    async listUsers() {
      const { rows } = await q(`SELECT * FROM users ORDER BY created_at DESC`);
      return rows;
    },
    async setUserStatus(id, status) {
      await q(`UPDATE users SET status = $1 WHERE id = $2`, [status, id]);
    },
    async setUserRole(id, role) {
      await q(`UPDATE users SET role = $1 WHERE id = $2`, [role, id]);
    },

    // ---- likes / comments ----
    async toggleLike(photoId, guestId) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const { rowCount } = await client.query(`SELECT 1 FROM likes WHERE photo_id=$1 AND guest_id=$2`, [photoId, guestId]);
        let liked;
        if (rowCount) {
          await client.query(`DELETE FROM likes WHERE photo_id=$1 AND guest_id=$2`, [photoId, guestId]);
          await client.query(`UPDATE photos SET like_count = GREATEST(0, like_count - 1) WHERE id=$1`, [photoId]);
          liked = false;
        } else {
          await client.query(`INSERT INTO likes (photo_id, guest_id) VALUES ($1,$2)`, [photoId, guestId]);
          await client.query(`UPDATE photos SET like_count = like_count + 1 WHERE id=$1`, [photoId]);
          liked = true;
        }
        const { rows } = await client.query(`SELECT like_count FROM photos WHERE id=$1`, [photoId]);
        await client.query('COMMIT');
        return { liked, likeCount: rows[0] ? Number(rows[0].like_count) : 0 };
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    },
    async addComment(c) {
      await q(
        `INSERT INTO comments (id, photo_id, event_id, guest_id, name, text, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [c.id, c.photo_id, c.event_id, c.guest_id, c.name, c.text, c.created_at]
      );
      const { rows } = await q(`UPDATE photos SET comment_count = comment_count + 1 WHERE id=$1 RETURNING comment_count`, [c.photo_id]);
      return rows[0] ? Number(rows[0].comment_count) : 0;
    },
    async listComments(photoId) {
      const { rows } = await q(`SELECT * FROM comments WHERE photo_id=$1 ORDER BY created_at ASC`, [photoId]);
      return rows;
    },
  };
}
