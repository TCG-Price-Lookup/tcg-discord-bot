/**
 * Price alert data access layer.
 *
 * Alerts are scoped per (user, guild). They optionally target a
 * channel — if set, the alert posts to that channel; otherwise the
 * bot DMs the user. The alerts worker reads from this module and
 * fans out the notifications.
 */

import { db, now } from "./db.js";

export type AlertDirection = "above" | "below";

export interface AlertRow {
  id: number;
  user_id: string;
  guild_id: string;
  channel_id: string | null;
  card_id: string;
  card_name: string;
  threshold: number;
  direction: AlertDirection;
  paused: number; // 0 | 1
  created_at: number;
  last_triggered_at: number | null;
}

const insertStmt = db.prepare(`
  INSERT INTO alerts (
    user_id, guild_id, channel_id, card_id, card_name,
    threshold, direction, paused, created_at
  ) VALUES (
    @user_id, @guild_id, @channel_id, @card_id, @card_name,
    @threshold, @direction, 0, @created_at
  )
`);

export function createAlert(input: {
  userId: string;
  guildId: string;
  channelId: string | null;
  cardId: string;
  cardName: string;
  threshold: number;
  direction: AlertDirection;
}): number {
  const result = insertStmt.run({
    user_id: input.userId,
    guild_id: input.guildId,
    channel_id: input.channelId,
    card_id: input.cardId,
    card_name: input.cardName,
    threshold: input.threshold,
    direction: input.direction,
    created_at: now(),
  });
  return result.lastInsertRowid as number;
}

const listByUserStmt = db.prepare(`
  SELECT id, user_id, guild_id, channel_id, card_id, card_name,
         threshold, direction, paused, created_at, last_triggered_at
  FROM alerts
  WHERE user_id = ? AND guild_id = ?
  ORDER BY created_at DESC
`);

export function listAlertsForUser(userId: string, guildId: string): AlertRow[] {
  return listByUserStmt.all(userId, guildId) as AlertRow[];
}

const deleteStmt = db.prepare(`
  DELETE FROM alerts WHERE id = ? AND user_id = ?
`);

/** Returns true if a row was actually removed. */
export function deleteAlert(id: number, userId: string): boolean {
  return deleteStmt.run(id, userId).changes > 0;
}

const setPausedStmt = db.prepare(`
  UPDATE alerts SET paused = ? WHERE id = ? AND user_id = ?
`);

export function setAlertPaused(id: number, userId: string, paused: boolean): boolean {
  return setPausedStmt.run(paused ? 1 : 0, id, userId).changes > 0;
}

const listActiveStmt = db.prepare(`
  SELECT id, user_id, guild_id, channel_id, card_id, card_name,
         threshold, direction, paused, created_at, last_triggered_at
  FROM alerts
  WHERE paused = 0
`);

/** Used by the alerts worker to enumerate everything that needs polling. */
export function listAllActiveAlerts(): AlertRow[] {
  return listActiveStmt.all() as AlertRow[];
}

const markTriggeredStmt = db.prepare(`
  UPDATE alerts SET last_triggered_at = ? WHERE id = ?
`);

export function markAlertTriggered(id: number): void {
  markTriggeredStmt.run(now(), id);
}
