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
        CREATE TABLE IF NOT EXISTS events (
          id          TEXT PRIMARY KEY,
          name        TEXT NOT NULL,
          host_name   TEXT,
          admin_token TEXT NOT NULL,
          created_at  BIGINT NOT NULL,
          photo_count INTEGER NOT NULL DEFAULT 0
        );
      `);
      await q(`
        CREATE TABLE IF NOT EXISTS photos (
          id         TEXT PRIMARY KEY,
          event_id   TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
          guest_name TEXT,
          filter     TEXT,
          width      INTEGER,
          height     INTEGER,
          bytes      INTEGER,
          full_key   TEXT,
          thumb_key  TEXT,
          created_at BIGINT NOT NULL
        );
      `);
      await q(
        `CREATE INDEX IF NOT EXISTS idx_photos_event_created
           ON photos (event_id, created_at DESC);`
      );
    },

    async createEvent(e) {
      await q(
        `INSERT INTO events (id, name, host_name, admin_token, created_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [e.id, e.name, e.host_name, e.admin_token, e.created_at]
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
          `INSERT INTO photos (id, event_id, guest_name, filter, width, height, bytes, full_key, thumb_key, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [p.id, p.event_id, p.guest_name, p.filter, p.width, p.height, p.bytes, p.full_key, p.thumb_key, p.created_at]
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

    async listPhotos(eventId, before, limit) {
      const { rows } = await q(
        `SELECT * FROM photos
         WHERE event_id = $1 AND created_at < $2
         ORDER BY created_at DESC
         LIMIT $3`,
        [eventId, before, limit]
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

    async listAllPhotos(eventId) {
      const { rows } = await q(
        `SELECT * FROM photos WHERE event_id = $1 ORDER BY created_at ASC`,
        [eventId]
      );
      return rows;
    },
  };
}
