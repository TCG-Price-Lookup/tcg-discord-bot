/**
 * SQLite database setup, schema, and shared queries.
 *
 * We use better-sqlite3 because:
 *
 *   1. The API is **synchronous**, which matches Discord.js's
 *      single-event-loop pattern much better than async drivers — no
 *      `await` boilerplate inside command handlers, no thread-pool
 *      surprises, no transaction coordination headaches.
 *   2. It's a single file on disk, so deploy = `mkdir data && run`.
 *      No external database server, no managed Postgres bill.
 *   3. The native build is fast and prebuilt binaries ship for the
 *      major platforms via @napi.
 *
 * If you ever need horizontal scaling, swap this module for a Postgres
 * driver — every other file imports through `db` so the call sites
 * don't change. Until then, SQLite handles thousands of guilds easily.
 */

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { env } from "./env.js";

// Resolve and create the data directory at module load. better-sqlite3
// will throw a confusing ENOENT if we try to open a database in a
// missing directory, so we create it eagerly.
const dataDir = path.resolve(env.DATA_DIR);
fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, "bot.db");

/**
 * The shared database handle. Imported by every module that needs
 * persistent storage. Single connection per process is the better-
 * sqlite3 recommendation — it's fully synchronous so there's no
 * connection pool to worry about.
 */
export const db = new Database(dbPath);

// Standard pragmas for an embedded app database. WAL mode lets us
// read while another transaction is committing, which matters for
// the alerts cron worker that runs alongside live command handlers.
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.pragma("synchronous = NORMAL");

// ============================================================ schema

/**
 * Schema is applied idempotently on every boot. Adding a new column
 * later means writing an ALTER TABLE here — better-sqlite3 errors on
 * "duplicate column" are caught and ignored so it stays idempotent.
 *
 * For anything more complex than additive columns, write a real
 * migration in src/migrations/.
 */
const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    guild_id TEXT NOT NULL,
    channel_id TEXT,
    card_id TEXT NOT NULL,
    card_name TEXT NOT NULL,
    threshold REAL NOT NULL,
    direction TEXT NOT NULL CHECK (direction IN ('above', 'below')),
    paused INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    last_triggered_at INTEGER
  );

  CREATE INDEX IF NOT EXISTS alerts_by_user ON alerts(user_id, guild_id);
  CREATE INDEX IF NOT EXISTS alerts_by_card ON alerts(card_id);

  CREATE TABLE IF NOT EXISTS portfolios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    guild_id TEXT NOT NULL,
    card_id TEXT NOT NULL,
    card_name TEXT NOT NULL,
    qty REAL NOT NULL DEFAULT 1,
    purchase_price REAL,
    added_at INTEGER NOT NULL,
    UNIQUE(user_id, guild_id, card_id)
  );

  CREATE INDEX IF NOT EXISTS portfolios_by_user ON portfolios(user_id, guild_id);

  CREATE TABLE IF NOT EXISTS server_config (
    guild_id TEXT PRIMARY KEY,
    default_game TEXT,
    daily_report_channel_id TEXT,
    daily_report_enabled INTEGER NOT NULL DEFAULT 0,
    set_release_channel_id TEXT,
    locale TEXT NOT NULL DEFAULT 'en',
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS known_sets (
    set_id TEXT PRIMARY KEY,
    game TEXT NOT NULL,
    name TEXT NOT NULL,
    first_seen_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS known_sets_by_game ON known_sets(game);

  CREATE TABLE IF NOT EXISTS watchlist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    guild_id TEXT NOT NULL,
    card_id TEXT NOT NULL,
    card_name TEXT NOT NULL,
    note TEXT,
    added_at INTEGER NOT NULL,
    UNIQUE(user_id, guild_id, card_id)
  );

  CREATE INDEX IF NOT EXISTS watchlist_by_user ON watchlist(user_id, guild_id);
`;

db.exec(SCHEMA_SQL);

// ============================================================ helpers

/** Current Unix epoch in seconds (matches the ts columns above). */
export function now(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * Cleanly close the database — call from the bot's SIGTERM handler so
 * the WAL is checkpointed before the container exits.
 */
export function closeDb(): void {
  try {
    db.close();
  } catch {
    // Already closed.
  }
}
