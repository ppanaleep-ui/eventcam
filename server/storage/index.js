import { config } from '../config.js';
import { createLocalStorage } from './local.js';
import { createS3Storage } from './s3.js';

/*
 * Selects the storage backend from config and exposes a single object used by
 * the routes. Call `initStorage()` once at startup.
 */

let store = null;

export async function initStorage() {
  store = config.useS3() ? await createS3Storage() : createLocalStorage();
  console.log(`Storage backend: ${store.kind}`);
  return store;
}

export function storage() {
  if (!store) throw new Error('Storage not initialised — call initStorage() first');
  return store;
}
