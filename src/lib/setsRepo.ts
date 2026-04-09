/**
 * Known-set bookkeeping for the set release notifier.
 *
 * The setsWorker polls the API daily and diffs the live set list
 * against this table. Anything new is announced to every guild that
 * has `set_release_channel_id` configured, then upserted here so it
 * isn't announced twice.
 *
 * On a fresh install the table is empty, so the **first** sweep would
 * announce every set ever as "new". To avoid that, the worker calls
 * `bootstrapKnownSetsIfEmpty` at boot time which back-fills every
 * existing set without sending notifications.
 */

import { db, now } from "./db.js";

export interface KnownSetRow {
  set_id: string;
  game: string;
  name: string;
  first_seen_at: number;
}

const upsertStmt = db.prepare(`
  INSERT INTO known_sets (set_id, game, name, first_seen_at)
  VALUES (?, ?, ?, ?)
  ON CONFLICT(set_id) DO NOTHING
`);

export function recordKnownSet(input: {
  setId: string;
  game: string;
  name: string;
}): boolean {
  const result = upsertStmt.run(input.setId, input.game, input.name, now());
  return result.changes > 0;
}

const selectAllIdsStmt = db.prepare(`SELECT set_id FROM known_sets`);

export function getKnownSetIds(): Set<string> {
  const rows = selectAllIdsStmt.all() as Array<{ set_id: string }>;
  return new Set(rows.map((r) => r.set_id));
}

const countStmt = db.prepare(`SELECT COUNT(*) as count FROM known_sets`);

export function knownSetCount(): number {
  const result = countStmt.get() as { count: number };
  return result.count;
}
