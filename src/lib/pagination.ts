/**
 * Pagination helpers for embed-based command results.
 *
 * Discord components (buttons / select menus) carry state via their
 * `customId` string, which has a 100-character limit. We pack the
 * state we need (command name, query, page index, optional filters)
 * into a colon-delimited blob and parse it back when the button fires.
 *
 * Format: `<commandName>:<page>:<base64-json-state>`
 *
 * Discord button components expire after 15 minutes by default. We
 * don't try to extend them — if a user clicks a stale button we just
 * re-fetch from the API as if it were a new query. The state blob is
 * self-contained so the bot doesn't need any in-memory session.
 */

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type APIButtonComponent,
} from "discord.js";

/** Maximum cards we render per page. Discord embeds cap at 4096 chars. */
export const PAGE_SIZE = 10;

/**
 * Build a `customId` string for a paginated button.
 *
 * @param command  the slash command this button belongs to (e.g. "price")
 * @param page     1-indexed page number after the click
 * @param state    arbitrary JSON-serialisable state to round-trip
 */
export function buildButtonId(
  command: string,
  page: number,
  state: Record<string, unknown>,
): string {
  const encoded = Buffer.from(JSON.stringify(state)).toString("base64url");
  const id = `${command}:${page}:${encoded}`;
  // Discord caps customId at 100 chars. Our state for /price is small
  // (q + game) so we should never hit this in practice — but if we do,
  // truncate the state to avoid a runtime error from Discord.
  if (id.length > 100) {
    return `${command}:${page}:`;
  }
  return id;
}

/** Parse a `customId` produced by {@link buildButtonId}. */
export function parseButtonId<T = Record<string, unknown>>(
  customId: string,
): { command: string; page: number; state: T } | null {
  const [command, pageStr, encoded] = customId.split(":");
  if (!command || !pageStr) return null;
  const page = Number(pageStr);
  if (!Number.isFinite(page)) return null;
  let state = {} as T;
  if (encoded) {
    try {
      state = JSON.parse(Buffer.from(encoded, "base64url").toString("utf-8")) as T;
    } catch {
      // Stale or corrupt state — fall through with empty state.
    }
  }
  return { command, page, state };
}

/**
 * Build a row of pagination buttons for the given page.
 *
 * @param command       slash command name (used as the button id prefix)
 * @param page          current 1-indexed page
 * @param totalPages    total number of pages
 * @param state         JSON-serialisable state to round-trip
 */
export function paginationRow(
  command: string,
  page: number,
  totalPages: number,
  state: Record<string, unknown>,
): ActionRowBuilder<ButtonBuilder> | null {
  if (totalPages <= 1) return null;

  const prev = new ButtonBuilder()
    .setCustomId(buildButtonId(command, page - 1, state))
    .setStyle(ButtonStyle.Secondary)
    .setLabel("‹ Prev")
    .setDisabled(page <= 1);

  const indicator = new ButtonBuilder()
    .setCustomId(`${command}:noop`)
    .setStyle(ButtonStyle.Secondary)
    .setLabel(`${page} / ${totalPages}`)
    .setDisabled(true);

  const next = new ButtonBuilder()
    .setCustomId(buildButtonId(command, page + 1, state))
    .setStyle(ButtonStyle.Secondary)
    .setLabel("Next ›")
    .setDisabled(page >= totalPages);

  return new ActionRowBuilder<ButtonBuilder>().addComponents(prev, indicator, next);
}

/** Convert a (1-indexed) page + total count into [offset, limit]. */
export function pageWindow(page: number, total: number): { offset: number; limit: number } {
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), totalPages);
  return {
    offset: (safePage - 1) * PAGE_SIZE,
    limit: PAGE_SIZE,
  };
}

/** Total number of pages for a given total result count. */
export function totalPages(total: number): number {
  return Math.max(1, Math.ceil(total / PAGE_SIZE));
}

/** Tiny re-export so commands can import a single symbol. */
export type { APIButtonComponent };
