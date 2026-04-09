/**
 * Discord embed builders for card data.
 *
 * Centralised here so every command renders cards consistently and
 * any change to the embed format only happens in one place.
 */

import { EmbedBuilder } from "discord.js";
import type { Card } from "@tcgpricelookup/sdk";
import { GAME_LABELS, type GameSlug } from "./sdk.js";

/** Brand colour used across every card embed. */
const EMBED_COLOR = 0x9333ea; // purple-600

/** Currency formatter for USD prices. */
function fmtMoney(value: number | null | undefined): string {
  if (value == null) return "—";
  return `$${value.toFixed(2)}`;
}

/** Picks a sensible "headline" price from a card's raw prices block. */
function headlinePrice(card: Card): string {
  const nm = card.prices?.raw?.near_mint?.tcgplayer?.market;
  if (nm != null) return `${fmtMoney(nm)} (NM)`;
  // Fall back to whatever condition tier exists.
  for (const cond of Object.values(card.prices?.raw ?? {})) {
    const market = cond?.tcgplayer?.market;
    if (market != null) return fmtMoney(market);
  }
  return "—";
}

/**
 * Build a single-card detail embed.
 *
 * Used by `/card` and as the post-result detail when `/price`
 * matches exactly one card.
 */
export function cardEmbed(card: Card): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setTitle(card.name)
    .setURL(`https://tcgpricelookup.com/card/${card.id}`)
    .setDescription(
      `**${card.set.name}** · ${GAME_LABELS[card.game.slug as GameSlug] ?? card.game.name}` +
        (card.number ? ` · #${card.number}` : "") +
        (card.rarity ? ` · ${card.rarity}` : ""),
    );

  if (card.image_url) {
    embed.setThumbnail(card.image_url);
  }

  // Per-condition raw price block. We sort by a fixed order so the
  // embed reads top-down (NM → Damaged) instead of randomly.
  const order = [
    "near_mint",
    "lightly_played",
    "moderately_played",
    "heavily_played",
    "damaged",
  ] as const;
  const lines: string[] = [];
  for (const condition of order) {
    const block = card.prices?.raw?.[condition];
    if (!block?.tcgplayer) continue;
    const tcg = block.tcgplayer;
    const ebay = block.ebay;
    const tcgStr = `TCGPlayer: ${fmtMoney(tcg.market)}`;
    const ebayStr =
      ebay?.avg_30d != null ? ` · eBay 30d: ${fmtMoney(ebay.avg_30d)}` : "";
    lines.push(`**${prettyCondition(condition)}** — ${tcgStr}${ebayStr}`);
  }
  if (lines.length > 0) {
    embed.addFields({ name: "Raw prices", value: lines.join("\n") });
  }

  // Graded summary — show the top grader/grade if available.
  const graded = card.prices?.graded;
  if (graded && Object.keys(graded).length > 0) {
    const gradedLines: string[] = [];
    for (const [grader, grades] of Object.entries(graded)) {
      if (!grades) continue;
      // Show grade 10 if present, otherwise the highest grade.
      const sorted = Object.keys(grades).sort((a, b) => Number(b) - Number(a));
      const topGrade = sorted[0];
      if (!topGrade) continue;
      const sources = grades[topGrade];
      const ebay = sources?.ebay?.avg_30d;
      if (ebay != null) {
        gradedLines.push(
          `**${grader.toUpperCase()} ${topGrade}** — ${fmtMoney(ebay)} (eBay 30d)`,
        );
      }
    }
    if (gradedLines.length > 0) {
      embed.addFields({ name: "Graded prices", value: gradedLines.join("\n") });
    }
  }

  embed.setFooter({
    text: "TCG Price Lookup · tcgpricelookup.com",
  });

  return embed;
}

/**
 * Build the multi-result list embed for a search query.
 *
 * Discord embed descriptions are capped at 4096 chars; we keep this
 * to ~10 results to stay well below the limit and avoid wrapping.
 */
export function searchResultsEmbed(
  query: string,
  cards: Card[],
  total: number,
  game?: string,
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setTitle(`Search: ${query}`)
    .setURL("https://tcgpricelookup.com/catalog")
    .setFooter({
      text: `${total} match${total === 1 ? "" : "es"} · TCG Price Lookup`,
    });

  if (game) {
    embed.setDescription(
      `Filtered to **${GAME_LABELS[game as GameSlug] ?? game}**`,
    );
  }

  if (cards.length === 0) {
    embed.addFields({
      name: "No matches",
      value:
        "Try a more specific name, or remove the game filter. Run `/games` to see supported games.",
    });
    return embed;
  }

  const lines = cards.slice(0, 10).map((card, i) => {
    const setName = card.set.name;
    const num = card.number ? ` #${card.number}` : "";
    const game = GAME_LABELS[card.game.slug as GameSlug] ?? card.game.name;
    return `**${i + 1}.** [${card.name}](https://tcgpricelookup.com/card/${card.id})${num} — ${setName} (${game}) · ${headlinePrice(card)}`;
  });
  embed.addFields({ name: "Top results", value: lines.join("\n") });

  if (total > cards.length) {
    embed.addFields({
      name: "More",
      value: `Showing ${cards.length} of ${total} matches. Add a game filter or refine your search to narrow down.`,
    });
  }

  return embed;
}

function prettyCondition(condition: string): string {
  return condition
    .split("_")
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join(" ");
}
