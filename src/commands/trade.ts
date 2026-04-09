/**
 * /trade — simplified trade evaluator.
 *
 * Two paste-style inputs ("offer" + "for") describing what each side
 * is putting on the table. The bot resolves every card, sums NM
 * TCGPlayer market value of each side, and returns a verdict embed
 * with the fairness ratio.
 *
 * No accept/reject buttons, no persistence. This is a calculator —
 * the human players still negotiate the trade themselves. Removing
 * the multiplayer flow lets the command ship in one file with no
 * new schema.
 *
 * Reuses the same line parser style as /deckcost so users only have
 * to learn one input format.
 */

import { EmbedBuilder, SlashCommandBuilder } from "discord.js";
import type { BotCommand } from "./index.js";
import { tcg, GAME_LABELS, type GameSlug } from "../lib/sdk.js";
import { describeError } from "../lib/errors.js";

const EMBED_COLOR = 0x9333ea;
const PARALLELISM = 8;
const MAX_LINES_PER_SIDE = 50;

interface TradeLine {
  qty: number;
  name: string;
}

interface PricedSide {
  lines: Array<{ qty: number; name: string; cardName: string; price: number | null; subtotal: number }>;
  unresolved: string[];
  total: number;
  totalCards: number;
}

/** Same line parser as /deckcost — kept here for self-contained reuse. */
function parseLine(rawLine: string): TradeLine | null {
  let line = rawLine.trim();
  if (!line || line.startsWith("//") || line.startsWith("#")) return null;
  line = line.replace(/\s*[\[(].*?[\])]\s*\d*$/g, "").trim();

  let match = line.match(/^(\d+)\s*x?\s+(.+)$/i);
  if (match) {
    const qty = parseInt(match[1]!, 10);
    const name = (match[2] ?? "").trim();
    if (qty > 0 && name) return { qty, name };
  }
  match = line.match(/^(.+?)\s+x\s*(\d+)$/i);
  if (match) {
    const qty = parseInt(match[2]!, 10);
    const name = (match[1] ?? "").trim();
    if (qty > 0 && name) return { qty, name };
  }
  return { qty: 1, name: line };
}

function parseSide(input: string, separator: RegExp): TradeLine[] {
  const lines: TradeLine[] = [];
  for (const part of input.split(separator)) {
    const result = parseLine(part);
    if (result) lines.push(result);
    if (lines.length >= MAX_LINES_PER_SIDE) break;
  }
  return lines;
}

async function priceSide(lines: TradeLine[]): Promise<PricedSide> {
  const result: PricedSide = {
    lines: [],
    unresolved: [],
    total: 0,
    totalCards: 0,
  };

  for (let i = 0; i < lines.length; i += PARALLELISM) {
    const batch = lines.slice(i, i + PARALLELISM);
    const resolved = await Promise.all(
      batch.map(async (line) => {
        try {
          const search = await tcg.cards.search({ q: line.name, limit: 1 });
          return { line, card: search.data[0] ?? null };
        } catch {
          return { line, card: null };
        }
      }),
    );

    for (const { line, card } of resolved) {
      if (!card) {
        result.unresolved.push(line.name);
        continue;
      }
      const price = card.prices?.raw?.near_mint?.tcgplayer?.market ?? null;
      const subtotal = price != null ? price * line.qty : 0;
      result.lines.push({
        qty: line.qty,
        name: line.name,
        cardName: card.name,
        price,
        subtotal,
      });
      result.total += subtotal;
      result.totalCards += line.qty;
    }
  }
  return result;
}

function renderSide(label: string, side: PricedSide): string {
  if (side.lines.length === 0) return `_no resolved cards_`;
  const top = side.lines
    .sort((a, b) => b.subtotal - a.subtotal)
    .slice(0, 8)
    .map(
      (l) =>
        `**${l.qty}×** ${l.cardName} — $${l.subtotal.toFixed(2)}`,
    )
    .join("\n");
  const more = side.lines.length > 8 ? `\n_…and ${side.lines.length - 8} more_` : "";
  return top + more;
}

function fairnessVerdict(offerTotal: number, forTotal: number): string {
  if (offerTotal === 0 && forTotal === 0) return "🤷 Both sides are valued at $0 — couldn't price anything.";
  if (offerTotal === 0) return "❌ Offer side has no value attached. Receiver wins by default.";
  if (forTotal === 0) return "❌ For side has no value attached. Offerer wins by default.";

  const ratio = offerTotal / forTotal;
  const pctDiff = Math.abs((offerTotal - forTotal) / Math.max(offerTotal, forTotal)) * 100;

  if (pctDiff < 5) {
    return `⚖️ **Fair trade** (within ${pctDiff.toFixed(1)}% of even). Difference: $${Math.abs(offerTotal - forTotal).toFixed(2)}`;
  }
  if (ratio > 1) {
    return `📈 **Offerer is overpaying by ${pctDiff.toFixed(1)}%** ($${(offerTotal - forTotal).toFixed(2)}). Receiver wins this trade.`;
  }
  return `📉 **Receiver is overpaying by ${pctDiff.toFixed(1)}%** ($${(forTotal - offerTotal).toFixed(2)}). Offerer wins this trade.`;
}

export const tradeCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("trade")
    .setDescription("Evaluate a trade — paste both sides, bot computes fair-value verdict")
    .addStringOption((opt) =>
      opt
        .setName("offer")
        .setDescription("Cards you're offering. Comma- or newline-separated, e.g. '2 Charizard, 1 Pikachu'")
        .setRequired(true)
        .setMaxLength(1000),
    )
    .addStringOption((opt) =>
      opt
        .setName("for")
        .setDescription("Cards you're receiving in return")
        .setRequired(true)
        .setMaxLength(1000),
    ),

  async execute(interaction) {
    const offerRaw = interaction.options.getString("offer", true);
    const forRaw = interaction.options.getString("for", true);

    await interaction.deferReply();

    // Accept either commas or newlines as the separator on each side.
    const offerLines = parseSide(offerRaw, /[,\n]/);
    const forLines = parseSide(forRaw, /[,\n]/);

    if (offerLines.length === 0 || forLines.length === 0) {
      await interaction.editReply({
        content:
          "❓ Couldn't parse one of the sides. Use comma- or newline-separated card names like `2 Charizard, 1 Pikachu`.",
      });
      return;
    }

    try {
      const [offerSide, forSide] = await Promise.all([
        priceSide(offerLines),
        priceSide(forLines),
      ]);

      const embed = new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setTitle("⚖️ Trade evaluation")
        .addFields(
          {
            name: `📤 Offer — $${offerSide.total.toFixed(2)} (${offerSide.totalCards} cards)`,
            value: renderSide("offer", offerSide),
            inline: true,
          },
          {
            name: `📥 For — $${forSide.total.toFixed(2)} (${forSide.totalCards} cards)`,
            value: renderSide("for", forSide),
            inline: true,
          },
          {
            name: "Verdict",
            value: fairnessVerdict(offerSide.total, forSide.total),
          },
        )
        .setFooter({
          text: "NM TCGPlayer market prices · TCG Price Lookup",
        });

      // Surface unresolved names so users know what to clean up.
      const allUnresolved = [...offerSide.unresolved, ...forSide.unresolved];
      if (allUnresolved.length > 0) {
        embed.addFields({
          name: `⚠️ Unresolved (${allUnresolved.length})`,
          value:
            allUnresolved.slice(0, 10).join(", ") +
            (allUnresolved.length > 10 ? "…" : ""),
        });
      }

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      await interaction.editReply({ content: describeError(err) });
    }
  },
};

// Mark games re-export silent — keeps the dead-code reaper happy if
// downstream tooling ever drops the GAME_LABELS import elsewhere.
export const _ = GAME_LABELS as Record<GameSlug, string>;
