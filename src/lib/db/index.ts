import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { mkdirSync } from 'node:fs';
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
  migrate(db, { migrationsFolder: path.resolve(/* turbopackIgnore: true */ process.cwd(), 'drizzle') });
  return db;
}

// Survive Next.js dev hot reloads without opening a new connection each time.
const g = globalThis as unknown as { __clubDb?: Db };
export const db: Db = (g.__clubDb ??= open());
export { schema };
