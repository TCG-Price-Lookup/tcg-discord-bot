/**
 * Portfolio data access layer.
 *
 * Each user's portfolio is scoped per (user, guild) so the same user
 * can keep separate stashes in different servers. The card_id +
 * card_name pair is denormalised into the row so we can render the
 * portfolio without re-fetching every card from the API every time.
 */

import { db, now } from "./db.js";

export interface PortfolioRow {
  id: number;
  user_id: string;
  guild_id: string;
  card_id: string;
  card_name: string;
  qty: number;
  purchase_price: number | null;
  added_at: number;
}

/**
 * Insert or update a portfolio row. If the user already owns this
 * card in this guild, the quantity is summed and the purchase price
 * is overwritten with the latest value.
 *
 * Using `ON CONFLICT` keeps everything in one round-trip so we don't
 * have to read-then-write under contention.
 */
const upsertStmt = db.prepare(`
  INSERT INTO portfolios (user_id, guild_id, card_id, card_name, qty, purchase_price, added_at)
  VALUES (@user_id, @guild_id, @card_id, @card_name, @qty, @purchase_price, @added_at)
  ON CONFLICT(user_id, guild_id, card_id) DO UPDATE SET
    qty = portfolios.qty + excluded.qty,
    purchase_price = COALESCE(excluded.purchase_price, portfolios.purchase_price),
    card_name = excluded.card_name
`);

export function addToPortfolio(input: {
  userId: string;
  guildId: string;
  cardId: string;
  cardName: string;
  qty: number;
  purchasePrice: number | null;
}): void {
  upsertStmt.run({
    user_id: input.userId,
    guild_id: input.guildId,
    card_id: input.cardId,
    card_name: input.cardName,
    qty: input.qty,
    purchase_price: input.purchasePrice,
    added_at: now(),
  });
}

const removeStmt = db.prepare(`
  DELETE FROM portfolios
  WHERE user_id = ? AND guild_id = ? AND card_id = ?
`);

export function removeFromPortfolio(
  userId: string,
  guildId: string,
  cardId: string,
): boolean {
  const result = removeStmt.run(userId, guildId, cardId);
  return result.changes > 0;
}

const listStmt = db.prepare(`
  SELECT id, user_id, guild_id, card_id, card_name, qty, purchase_price, added_at
  FROM portfolios
  WHERE user_id = ? AND guild_id = ?
  ORDER BY added_at DESC
`);

export function listPortfolio(userId: string, guildId: string): PortfolioRow[] {
  return listStmt.all(userId, guildId) as PortfolioRow[];
}

const findByNameStmt = db.prepare(`
  SELECT id, user_id, guild_id, card_id, card_name, qty, purchase_price, added_at
  FROM portfolios
  WHERE user_id = ? AND guild_id = ? AND card_name = ?
  LIMIT 1
`);

/** Look up a single row by card name (used for /portfolio remove). */
export function findPortfolioRowByName(
  userId: string,
  guildId: string,
  cardName: string,
): PortfolioRow | null {
  return (findByNameStmt.get(userId, guildId, cardName) as PortfolioRow | undefined) ?? null;
}
