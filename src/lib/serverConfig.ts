/**
 * Per-server configuration storage.
 *
 * Every guild that uses the bot gets exactly one row in `server_config`.
 * The row is upserted lazily — we don't pre-create rows for guilds that
 * never run /config.
 *
 * Reading config is **synchronous and very hot** (the /price command
 * calls it on every invocation to discover the default-game), so we
 * cache everything in memory and write through to SQLite on every
 * mutation. Cache invalidation is trivial here because writes are rare
 * and we know exactly which row changed.
 */

import { db, now } from "./db.js";
import { GAME_SLUGS, type GameSlug } from "./sdk.js";

export interface ServerConfig {
  guild_id: string;
  default_game: GameSlug | null;
  daily_report_channel_id: string | null;
  daily_report_enabled: boolean;
  set_release_channel_id: string | null;
  locale: string;
  updated_at: number;
}

const SUPPORTED_LOCALES = ["en", "pl", "fr", "de", "es", "it", "ja", "nl", "pt-BR"] as const;
type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export function isSupportedLocale(value: string): value is SupportedLocale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

export function isGameSlug(value: string): value is GameSlug {
  return (GAME_SLUGS as readonly string[]).includes(value);
}

// ============================================================ statements

const selectStmt = db.prepare(`
  SELECT guild_id, default_game, daily_report_channel_id, daily_report_enabled,
         set_release_channel_id, locale, updated_at
  FROM server_config
  WHERE guild_id = ?
`);

const upsertStmt = db.prepare(`
  INSERT INTO server_config (
    guild_id, default_game, daily_report_channel_id, daily_report_enabled,
    set_release_channel_id, locale, updated_at
  ) VALUES (
    @guild_id, @default_game, @daily_report_channel_id, @daily_report_enabled,
    @set_release_channel_id, @locale, @updated_at
  )
  ON CONFLICT(guild_id) DO UPDATE SET
    default_game = excluded.default_game,
    daily_report_channel_id = excluded.daily_report_channel_id,
    daily_report_enabled = excluded.daily_report_enabled,
    set_release_channel_id = excluded.set_release_channel_id,
    locale = excluded.locale,
    updated_at = excluded.updated_at
`);

const allStmt = db.prepare(`
  SELECT guild_id, default_game, daily_report_channel_id, daily_report_enabled,
         set_release_channel_id, locale, updated_at
  FROM server_config
`);

// ============================================================ in-memory cache

interface ConfigRow {
  guild_id: string;
  default_game: string | null;
  daily_report_channel_id: string | null;
  daily_report_enabled: number;
  set_release_channel_id: string | null;
  locale: string;
  updated_at: number;
}

const cache = new Map<string, ServerConfig>();

function rowToConfig(row: ConfigRow): ServerConfig {
  return {
    guild_id: row.guild_id,
    default_game: (row.default_game ?? null) as GameSlug | null,
    daily_report_channel_id: row.daily_report_channel_id,
    daily_report_enabled: row.daily_report_enabled === 1,
    set_release_channel_id: row.set_release_channel_id,
    locale: row.locale,
    updated_at: row.updated_at,
  };
}

function defaults(guildId: string): ServerConfig {
  return {
    guild_id: guildId,
    default_game: null,
    daily_report_channel_id: null,
    daily_report_enabled: false,
    set_release_channel_id: null,
    locale: "en",
    updated_at: now(),
  };
}

// Hydrate cache once at module load. The bot is in tens of guilds at
// most for the foreseeable future, so loading every row is fine.
for (const row of allStmt.all() as ConfigRow[]) {
  cache.set(row.guild_id, rowToConfig(row));
}

// ============================================================ public api

/**
 * Read the current config for a guild. Returns sensible defaults if
 * the guild has never set anything — this means callers never have
 * to deal with `null`.
 */
export function getServerConfig(guildId: string): ServerConfig {
  const cached = cache.get(guildId);
  if (cached) return cached;
  const row = selectStmt.get(guildId) as ConfigRow | undefined;
  if (!row) return defaults(guildId);
  const config = rowToConfig(row);
  cache.set(guildId, config);
  return config;
}

/**
 * Apply a partial update and persist it. Returns the merged config.
 *
 * Mutations are typed: callers can only set fields the schema knows
 * about, and the timestamp is always refreshed.
 */
export function updateServerConfig(
  guildId: string,
  patch: Partial<Omit<ServerConfig, "guild_id" | "updated_at">>,
): ServerConfig {
  const current = getServerConfig(guildId);
  const merged: ServerConfig = {
    ...current,
    ...patch,
    guild_id: guildId,
    updated_at: now(),
  };
  upsertStmt.run({
    guild_id: merged.guild_id,
    default_game: merged.default_game,
    daily_report_channel_id: merged.daily_report_channel_id,
    daily_report_enabled: merged.daily_report_enabled ? 1 : 0,
    set_release_channel_id: merged.set_release_channel_id,
    locale: merged.locale,
    updated_at: merged.updated_at,
  });
  cache.set(guildId, merged);
  return merged;
}

/** Iterate over every persisted server config. Used by background workers. */
export function listAllServerConfigs(): ServerConfig[] {
  return Array.from(cache.values());
}
