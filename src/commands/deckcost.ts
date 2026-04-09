/**
 * /deckcost — paste a deck list, get the total cost.
 *
 * Format-agnostic: any line with a leading quantity + a card name
 * is parsed. Works for MTG (`4 Lightning Bolt`), Pokémon
 * (`3x Charizard`), Yu-Gi-Oh (`1 Ash Blossom & Joyous Spring`),
 * Lorcana, One Piece, etc.
 *
 * Each unique name is resolved against the API in parallel (capped),
 * priced at NM TCGPlayer market, multiplied by the quantity, and
 * summed into a total. Unresolved names are listed at the bottom so
 * the user can clean up their paste and re-run.
 */

import { EmbedBuilder, SlashCommandBuilder } from "discord.js";
import type { BotCommand } from "./index.js";
import { tcg, GAME_LABELS, type GameSlug } from "../lib/sdk.js";
import { describeError } from "../lib/errors.js";

const EMBED_COLOR = 0x9333ea;
const MAX_LINES = 200;
const PARALLELISM = 8;

interface DeckLine {
  qty: number;
  name: string;
}

interface PricedLine extends DeckLine {
  cardId: string;
  cardName: string;
  price: number | null;
  subtotal: number;
}

/**
 * Parse a deck list line. Accepts:
 *
 *   "4 Lightning Bolt"
 *   "4x Lightning Bolt"
 *   "Lightning Bolt x4"
 *   "Lightning Bolt"     (defaults to qty 1)
 *
 * Strips trailing set codes / collector numbers in square brackets
 * or parentheses (e.g. "4 Lightning Bolt (M21) 162") so paste-from-
 * Moxfield-style lists work without preprocessing.
 */
function parseDeckLine(rawLine: string): DeckLine | null {
  let line = rawLine.trim();
  if (!line || line.startsWith("//") || line.startsWith("#")) return null;

  // Strip a section header like "Sideboard:" or "Deck".
  if (/^[A-Za-z]+:$/.test(line)) return null;

  // Strip trailing set/collector annotations.
  line = line.replace(/\s*[\[(].*?[\])]\s*\d*$/g, "").trim();
  line = line.replace(/\s+\([A-Z0-9]{2,5}\)\s*\d*$/g, "").trim();

  // Try "<qty> <name>" or "<qty>x <name>".
  let match = line.match(/^(\d+)\s*x?\s+(.+)$/i);
  if (match) {
    const qty = parseInt(match[1]!, 10);
    const name = (match[2] ?? "").trim();
    if (qty > 0 && name) return { qty, name };
  }
  // Try "<name> x<qty>".
  match = line.match(/^(.+?)\s+x\s*(\d+)$/i);
  if (match) {
    const qty = parseInt(match[2]!, 10);
    const name = (match[1] ?? "").trim();
    if (qty > 0 && name) return { qty, name };
  }
  // Bare card name → assume 1 copy.
  return { qty: 1, name: line };
}

/** Aggregate identical names into one entry with summed quantity. */
function aggregate(lines: DeckLine[]): DeckLine[] {
  const merged = new Map<string, DeckLine>();
  for (const line of lines) {
    const key = line.name.toLowerCase();
    const existing = merged.get(key);
    if (existing) {
      existing.qty += line.qty;
    } else {
      merged.set(key, { ...line });
    }
  }
  return Array.from(merged.values());
}

export const deckcostCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("deckcost")
    .setDescription("Paste a deck list, get the total cost in NM TCGPlayer market prices")
    .addStringOption((opt) =>
      opt
        .setName("deck")
        .setDescription("Deck list — one card per line, e.g. '4 Lightning Bolt'")
        .setRequired(true)
        .setMaxLength(2000),
    )
    .addStringOption((opt) =>
      opt
        .setName("game")
        .setDescription("Filter card lookups to a specific game")
        .setRequired(false)
        .addChoices(
          ...Object.entries(GAME_LABELS).map(([value, name]) => ({
            name,
            value,
          })),
        ),
    ),

  async execute(interaction) {
    const raw = interaction.options.getString("deck", true);
    const game = (interaction.options.getString("game") ?? undefined) as
      | GameSlug
      | undefined;

    await interaction.deferReply();

    // Phase 1: parse + aggregate.
    const allLines = raw.split(/\r?\n/);
    const parsed: DeckLine[] = [];
    for (const rawLine of allLines) {
      const result = parseDeckLine(rawLine);
      if (result) parsed.push(result);
      if (parsed.length >= MAX_LINES) break;
    }

    if (parsed.length === 0) {
      await interaction.editReply({
        content:
          "❓ Couldn't parse any deck lines. Use one card per line, e.g. `4 Lightning Bolt`.",
      });
      return;
    }

    const aggregated = aggregate(parsed);

    // Phase 2: resolve names in parallel batches.
    const priced: PricedLine[] = [];
    const unresolved: string[] = [];

    try {
      for (let i = 0; i < aggregated.length; i += PARALLELISM) {
        const batch = aggregated.slice(i, i + PARALLELISM);
        const results = await Promise.all(
          batch.map(async (line) => {
            try {
              const search = await tcg.cards.search({ q: line.name, game, limit: 1 });
              const card = search.data[0];
              if (!card) return { line, card: null };
              return { line, card };
            } catch {
              return { line, card: null };
            }
          }),
        );
        for (const { line, card } of results) {
          if (!card) {
            unresolved.push(line.name);
            continue;
          }
          const price = card.prices?.raw?.near_mint?.tcgplayer?.market ?? null;
          priced.push({
            ...line,
            cardId: card.id,
            cardName: card.name,
            price,
            subtotal: price != null ? price * line.qty : 0,
          });
        }
      }
    } catch (err) {
      await interaction.editReply({ content: describeError(err) });
      return;
    }

    // Phase 3: render. Sort by subtotal desc so the most expensive
    // cards are at the top — that's where the deck cost comes from.
    priced.sort((a, b) => b.subtotal - a.subtotal);

    const totalCards = priced.reduce((sum, l) => sum + l.qty, 0);
    const totalCost = priced.reduce((sum, l) => sum + l.subtotal, 0);

    const top = priced.slice(0, 15).map((line) => {
      const priceStr = line.price != null ? `$${line.price.toFixed(2)}` : "—";
      return `**${line.qty}×** ${line.cardName} — ${priceStr} = **$${line.subtotal.toFixed(2)}**`;
    });

    const embed = new EmbedBuilder()
      .setColor(EMBED_COLOR)
      .setTitle("🃏 Deck cost breakdown")
      .setDescription(top.join("\n"))
      .addFields(
        {
          name: "Total cards",
          value: `${totalCards}`,
          inline: true,
        },
        {
          name: "Total NM cost",
          value: `**$${totalCost.toFixed(2)}**`,
          inline: true,
        },
      )
      .setFooter({ text: "TCG Price Lookup · NM TCGPlayer market prices" });

    if (priced.length > 15) {
      embed.addFields({
        name: "Showing",
        value: `Top 15 of ${priced.length} unique cards by subtotal.`,
      });
    }

    if (unresolved.length > 0) {
      embed.addFields({
        name: `⚠️ Unresolved (${unresolved.length})`,
        value: unresolved.slice(0, 10).join(", ") + (unresolved.length > 10 ? "…" : ""),
      });
    }

    await interaction.editReply({ embeds: [embed] });
  },
};
