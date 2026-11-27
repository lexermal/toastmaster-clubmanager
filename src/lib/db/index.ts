import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { closeSync, mkdirSync, openSync, statSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import * as schema from './schema';

export const DATA_DIR = path.resolve(/* turbopackIgnore: true */ process.env.DATA_DIR ?? './data');

type Db = BetterSQLite3Database<typeof schema>;

// The web app and the worker are two processes on one SQLite file; WAL lets them read while the
// other writes, and busy_timeout makes a writer wait instead of failing on a short lock.
function open(): Db {
  mkdirSync(DATA_DIR, { recursive: true });
  const sqlite = new Database(path.join(DATA_DIR, 'club.db'));
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('busy_timeout = 5000');
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite, { schema });
  withMigrationLock(() => migrate(db, { migrationsFolder: path.resolve(/* turbopackIgnore: true */ process.cwd(), 'drizzle') }));
  return db;
}

/**
 * Web app, worker and Next's build workers all open the DB at startup. On a fresh file they would
 * run the same migrations at once and crash on "table already exists", so only one migrates at a time.
 */
function withMigrationLock(fn: () => void) {
  const lock = path.join(DATA_DIR, 'migrate.lock');
  const deadline = Date.now() + 60_000;
  for (;;) {
    try {
      closeSync(openSync(lock, 'wx'));
      break;
    } catch {
      // A lock older than 30 s belongs to a process that died mid-migration.
      try {
        if (Date.now() - statSync(lock).mtimeMs > 30_000) unlinkSync(lock);
      } catch {}
      if (Date.now() > deadline) throw new Error(`Timed out waiting for ${lock}`);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
    }
  }
  try {
    fn();
  } finally {
    unlinkSync(lock);
  }
}

// Survive Next.js dev hot reloads without opening a new connection each time.
const g = globalThis as unknown as { __clubDb?: Db };
export const db: Db = (g.__clubDb ??= open());
export { schema };
