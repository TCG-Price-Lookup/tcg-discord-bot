/**
 * /grading-calc — PSA / BGS / CGC grading economics calculator.
 *
 * Helps the user decide whether to send a card for grading. Pulls
 * the card's raw NM TCGPlayer market price + its top graded comp
 * (PSA 9 vs PSA 10 if available), subtracts a representative grading
 * fee, and tells the user what the expected profit looks like at
 * each grade tier.
 *
 * The grading fees are hard-coded ballpark figures for the standard
 * (non-rush, non-bulk) tier of each service. They're rough by design —
 * the goal is "is this even close to making sense?" not a precision
 * accounting calculator.
 */

import { EmbedBuilder, SlashCommandBuilder } from "discord.js";
import type { Card } from "@tcgpricelookup/sdk";
import type { BotCommand } from "./index.js";
import { tcg, GAME_LABELS, type GameSlug } from "../lib/sdk.js";
import { describeError } from "../lib/errors.js";

const EMBED_COLOR = 0x9333ea;

/**
 * Standard-tier per-card grading fees in USD. These are deliberately
 * approximate — services change their pricing regularly and have
 * multiple tiers (bulk / value / regular / express / super express).
 * The standard tier is what most collectors use for cards in the
 * $50-$500 raw range, which is exactly the range where the math
 * matters most.
 */
const FEES = {
  PSA: 25,
  BGS: 35,
  CGC: 20,
} as const;

/** Buyer-side fees & shipping when reselling the graded card. */
const SELL_OVERHEAD_PCT = 0.15; // eBay + payment processor
const SHIPPING_USD = 8;          // graded slab shipping with tracking

function fmtMoney(value: number | null | undefined): string {
  if (value == null) return "—";
  return `$${value.toFixed(2)}`;
}

/**
 * Find the best graded comp for a card. Looks for an eBay 30d
 * average at PSA 10 first, then PSA 9, then any service / grade.
 */
function bestGradedComp(
  card: Card,
): { service: string; grade: string; price: number } | null {
  const graded = card.prices?.graded;
  if (!graded) return null;

  // Preference order: PSA 10 → PSA 9 → BGS 10 → BGS 9.5 → CGC 10 → anything else.
  const preferences: Array<[string, string]> = [
    ["psa", "10"],
    ["psa", "9"],
    ["bgs", "10"],
    ["bgs", "9.5"],
    ["cgc", "10"],
    ["cgc", "9.5"],
  ];

  for (const [service, grade] of preferences) {
    const price = graded[service]?.[grade]?.ebay?.avg_30d;
    if (typeof price === "number") {
      return { service, grade, price };
    }
  }

  // Fallback: walk every service / grade and take the highest.
  let best: { service: string; grade: string; price: number } | null = null;
  for (const [service, grades] of Object.entries(graded)) {
    if (!grades) continue;
    for (const [grade, sources] of Object.entries(grades)) {
      const price = sources?.ebay?.avg_30d;
      if (typeof price === "number" && (!best || price > best.price)) {
        best = { service, grade, price };
      }
    }
  }
  return best;
}

/**
 * Compute net profit/loss given a graded sale price.
 *
 * net = sale_price * (1 - sell_overhead_pct) - grading_fee - shipping - raw_cost
 */
function netProfit(
  salePrice: number,
  rawCost: number,
  gradingFee: number,
): number {
  const proceeds = salePrice * (1 - SELL_OVERHEAD_PCT);
  return proceeds - gradingFee - SHIPPING_USD - rawCost;
}

export const gradingCalcCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("grading-calc")
    .setDescription("Should you grade this card? Quick PSA / BGS / CGC economics calculator")
    .addStringOption((opt) =>
      opt
        .setName("card")
        .setDescription("Card name")
        .setRequired(true)
        .setMaxLength(100)
        .setAutocomplete(true),
    )
    .addNumberOption((opt) =>
      opt
        .setName("raw_cost")
        .setDescription("What the raw card costs you (defaults to current NM market)")
        .setRequired(false)
        .setMinValue(0)
        .setMaxValue(1_000_000),
    ),

  async execute(interaction) {
    const query = interaction.options.getString("card", true);
    const overrideRawCost = interaction.options.getNumber("raw_cost");

    await interaction.deferReply();

    try {
      const search = await tcg.cards.search({ q: query, limit: 1 });
      const card = search.data[0];
      if (!card) {
        await interaction.editReply({ content: `❓ No card found for **${query}**.` });
        return;
      }

      // Resolve the full card so we get the graded prices block.
      // /cards/{id} returns the full price tree; the search response
      // already has it but we re-fetch to be defensive in case the
      // search variant ever ships a trimmed payload.
      const full = await tcg.cards.get(card.id);

      const rawMarket = full.prices?.raw?.near_mint?.tcgplayer?.market;
      const rawCost = overrideRawCost ?? rawMarket ?? null;

      if (rawCost == null) {
        await interaction.editReply({
          content:
            "❓ Couldn't determine a raw NM cost for this card. Pass `raw_cost:<usd>` to override.",
        });
        return;
      }

      const comp = bestGradedComp(full);
      const game = GAME_LABELS[full.game.slug as GameSlug] ?? full.game.name;

      const embed = new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setTitle(`🎓 Grading economics: ${full.name}`)
        .setURL(`https://tcgpricelookup.com/card/${full.id}`)
        .setDescription(
          `**${full.set.name}** · ${game}\n` +
            `Raw NM cost (input): **${fmtMoney(rawCost)}**`,
        )
        .setFooter({
          text: "Fees are approximate · TCG Price Lookup",
        });

      if (full.image_url) embed.setThumbnail(full.image_url);

      if (!comp) {
        embed.addFields({
          name: "No graded data",
          value:
            "We don't have any eBay sold averages for graded copies of this card. Either the card hasn't been graded much, or it's outside the Trader plan tier.",
        });
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      // Run the math against each service using the best comp as the
      // assumed sale price. This is the optimistic case — every grading
      // calculation assumes you nail the highest grade you're aiming for.
      const lines: string[] = [];
      for (const [service, fee] of Object.entries(FEES)) {
        const profit = netProfit(comp.price, rawCost, fee);
        const verdict = profit > 50 ? "✅" : profit > 0 ? "🟡" : "❌";
        const sign = profit >= 0 ? "+" : "";
        lines.push(
          `${verdict} **${service}** (fee ~$${fee}): ${sign}${fmtMoney(profit)} net per card`,
        );
      }

      embed.addFields(
        {
          name: `Best graded comp: ${comp.service.toUpperCase()} ${comp.grade}`,
          value: `${fmtMoney(comp.price)} (eBay 30-day average)`,
        },
        {
          name: "Estimated net profit (assuming you hit the comp grade)",
          value: lines.join("\n"),
        },
        {
          name: "Assumptions",
          value:
            `• ${(SELL_OVERHEAD_PCT * 100).toFixed(0)}% marketplace + payment fees on sale\n` +
            `• $${SHIPPING_USD} shipping for the slab\n` +
            "• You hit the comp grade on submission (not guaranteed!)",
        },
      );

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      await interaction.editReply({ content: describeError(err) });
    }
  },

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused(true);
    if (focused.name !== "card") {
      await interaction.respond([]);
      return;
    }
    const query = focused.value.trim();
    if (query.length < 2) {
      await interaction.respond([]);
      return;
    }
    try {
      const results = await tcg.cards.search({ q: query, limit: 10 });
      const choices = results.data.map((card) => {
        const setShort = card.set.name.length > 30
          ? card.set.name.slice(0, 27) + "..."
          : card.set.name;
        const gameLabel = GAME_LABELS[card.game.slug as GameSlug] ?? card.game.name;
        const name = `${card.name} — ${setShort} (${gameLabel})`.slice(0, 100);
        return { name, value: card.name.slice(0, 100) };
      });
      await interaction.respond(choices);
    } catch {
      await interaction.respond([]);
    }
  },
};
