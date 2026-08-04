import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { config } from './config.js';

fs.mkdirSync(config.dataDir, { recursive: true });

const db = new Database(path.join(config.dataDir, 'eventcam.db'));

// WAL gives us concurrent readers alongside a writer — important when many
// guests are polling/reading the album while photos stream in.
db.pragma('journal_mode = WAL');
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
    created_at INTEGER NOT NULL,
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_photos_event_created
    ON photos (event_id, created_at DESC);
`);

export default db;
