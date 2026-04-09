/**
 * Watchlist data access layer.
 *
 * The watchlist is a lightweight tracker — cards a user wants to keep
 * an eye on without committing to a hard /alert threshold. Think of it
 * as bookmarking the card. /watchlist show batch-refreshes prices for
 * everything in the user's list.
 */

import { db, now } from "./db.js";

export interface WatchlistRow {
  id: number;
  user_id: string;
  guild_id: string;
  card_id: string;
  card_name: string;
  note: string | null;
  added_at: number;
}

const upsertStmt = db.prepare(`
  INSERT INTO watchlist (user_id, guild_id, card_id, card_name, note, added_at)
  VALUES (@user_id, @guild_id, @card_id, @card_name, @note, @added_at)
  ON CONFLICT(user_id, guild_id, card_id) DO UPDATE SET
    note = excluded.note,
    card_name = excluded.card_name
`);

export function addToWatchlist(input: {
  userId: string;
  guildId: string;
  cardId: string;
  cardName: string;
  note: string | null;
}): void {
  upsertStmt.run({
    user_id: input.userId,
    guild_id: input.guildId,
    card_id: input.cardId,
    card_name: input.cardName,
    note: input.note,
    added_at: now(),
  });
}

const removeStmt = db.prepare(`
  DELETE FROM watchlist WHERE user_id = ? AND guild_id = ? AND card_id = ?
`);

export function removeFromWatchlist(
  userId: string,
  guildId: string,
  cardId: string,
): boolean {
  return removeStmt.run(userId, guildId, cardId).changes > 0;
}

const listStmt = db.prepare(`
  SELECT id, user_id, guild_id, card_id, card_name, note, added_at
  FROM watchlist
  WHERE user_id = ? AND guild_id = ?
  ORDER BY added_at DESC
`);

export function listWatchlist(userId: string, guildId: string): WatchlistRow[] {
  return listStmt.all(userId, guildId) as WatchlistRow[];
}

const findByNameStmt = db.prepare(`
  SELECT id, user_id, guild_id, card_id, card_name, note, added_at
  FROM watchlist
  WHERE user_id = ? AND guild_id = ? AND card_name = ?
  LIMIT 1
`);

export function findWatchlistRowByName(
  userId: string,
  guildId: string,
  cardName: string,
): WatchlistRow | null {
  return (
    (findByNameStmt.get(userId, guildId, cardName) as WatchlistRow | undefined) ?? null
  );
}
