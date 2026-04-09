/**
 * /history — daily price history with a chart image.
 *
 * Trader plan endpoint. The command takes a card name (autocompleted
 * like /price), resolves it to a UUID, fetches the daily history for
 * the requested period, builds a quickchart.io URL, and renders the
 * chart as the embed image.
 *
 * If the user is on the Free plan, the SDK throws PlanAccessError and
 * we surface a friendly upgrade prompt via describeError.
 */

import { EmbedBuilder, SlashCommandBuilder } from "discord.js";
import type { Card } from "@tcgpricelookup/sdk";
import type { BotCommand } from "./index.js";
import { tcg, GAME_LABELS, type GameSlug } from "../lib/sdk.js";
import { describeError } from "../lib/errors.js";
import {
  buildPriceChartUrl,
  priceChangeSummary,
  type PriceChartPoint,
} from "../lib/chart.js";

const EMBED_COLOR = 0x9333ea;

type Period = "7d" | "30d" | "90d" | "1y";

const PERIOD_LABELS: Record<Period, string> = {
  "7d": "7 days",
  "30d": "30 days",
  "90d": "90 days",
  "1y": "1 year",
};

/**
 * Pull the TCGPlayer market price for the "near_mint" condition out
 * of a HistoryDay. We use NM market as the canonical chart line
 * because it's the most consistently populated price across cards.
 *
 * Returns null if there's no NM TCGPlayer market entry that day.
 */
function extractNmMarket(day: { prices: Array<Record<string, unknown>> }): number | null {
  for (const row of day.prices) {
    if (
      row.source === "tcgplayer" &&
      (row.condition === "near_mint" || row.condition === "nm")
    ) {
      const m = row.price_market;
      if (typeof m === "number") return m;
    }
  }
  // Fallback: pick the first tcgplayer row regardless of condition,
  // so cards that only ship "raw" prices still chart something.
  for (const row of day.prices) {
    if (row.source === "tcgplayer" && typeof row.price_market === "number") {
      return row.price_market;
    }
  }
  return null;
}

export const historyCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("history")
    .setDescription("Show a price history chart for a card (Trader plan)")
    .addStringOption((opt) =>
      opt
        .setName("card")
        .setDescription("Card name")
        .setRequired(true)
        .setMaxLength(100)
        .setAutocomplete(true),
    )
    .addStringOption((opt) =>
      opt
        .setName("period")
        .setDescription("How far back to chart (defaults to 30 days)")
        .setRequired(false)
        .addChoices(
          { name: "7 days", value: "7d" },
          { name: "30 days", value: "30d" },
          { name: "90 days", value: "90d" },
          { name: "1 year", value: "1y" },
        ),
    ),

  async execute(interaction) {
    const query = interaction.options.getString("card", true);
    const period = (interaction.options.getString("period") ?? "30d") as Period;

    await interaction.deferReply();

    try {
      // Step 1: resolve the card name to a UUID via the search endpoint.
      const search = await tcg.cards.search({ q: query, limit: 1 });
      const card = search.data[0];
      if (!card) {
        await interaction.editReply({
          content: `❓ No card found for **${query}**.`,
        });
        return;
      }

      // Step 2: fetch daily history. This is the Trader-plan endpoint —
      // PlanAccessError on Free is mapped to a friendly upgrade message.
      const history = await tcg.cards.history(card.id, { period });

      // Step 3: extract the NM TCGPlayer market line.
      const points: PriceChartPoint[] = history.data.map((day) => ({
        date: day.date,
        price: extractNmMarket(day as never),
      }));

      const chartUrl = buildPriceChartUrl({
        title: `${card.name} — NM TCGPlayer market`,
        points,
      });

      const embed = buildHistoryEmbed(card, period, chartUrl, points);
      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      await interaction.editReply({ content: describeError(err) });
    }
  },

  /** Same autocomplete pattern as /price. */
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

/** Build the history embed with title, image, and change summary. */
function buildHistoryEmbed(
  card: Card,
  period: Period,
  chartUrl: string | null,
  points: PriceChartPoint[],
): EmbedBuilder {
  const game = GAME_LABELS[card.game.slug as GameSlug] ?? card.game.name;
  const setLine = card.number
    ? `${card.set.name} #${card.number}`
    : card.set.name;

  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setTitle(`${card.name} — ${PERIOD_LABELS[period]}`)
    .setURL(`https://tcgpricelookup.com/card/${card.id}`)
    .setDescription(`**${setLine}** · ${game}`)
    .setFooter({ text: "TCG Price Lookup · tcgpricelookup.com" });

  if (chartUrl) {
    embed.setImage(chartUrl);
  } else {
    embed.addFields({
      name: "No chart data",
      value:
        "We don't have enough TCGPlayer history for this card in the requested period. Try a longer period or a different card.",
    });
  }

  const summary = priceChangeSummary(points);
  if (summary) {
    embed.addFields({ name: "Change", value: summary });
  }

  return embed;
}
