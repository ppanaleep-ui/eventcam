import { config } from '../config.js';
import { createSqliteRepo } from './sqlite.js';
import { createPostgresRepo } from './postgres.js';

/*
 * Selects the database backend from config and exposes a single async
 * repository used by the routes. Call `initDb()` once at startup.
 */

let repo = null;

export async function initDb() {
  repo = config.usePostgres() ? await createPostgresRepo() : createSqliteRepo();
  await repo.init();
  console.log(`DB backend: ${config.usePostgres() ? 'postgres' : 'sqlite'}`);
  return repo;
}

export function db() {
  if (!repo) throw new Error('Database not initialised — call initDb() first');
  return repo;
}
