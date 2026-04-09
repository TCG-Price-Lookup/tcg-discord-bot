/**
 * /portfolio — per-user collection tracking.
 *
 * Each (user, guild) pair gets its own portfolio. Subcommands:
 *
 *   /portfolio add <card> [qty] [purchase_price]
 *   /portfolio show
 *   /portfolio remove <card>
 *
 * The "show" view re-prices the user's holdings live by batching all
 * unique card IDs into one /cards/search call (auto-chunked at 20 by
 * the SDK). This is the long-term retention feature — users with a
 * portfolio come back weekly to check their value.
 */

import { EmbedBuilder, SlashCommandBuilder } from "discord.js";
import type { BotCommand } from "./index.js";
import { tcg, GAME_LABELS, type GameSlug } from "../lib/sdk.js";
import { describeError } from "../lib/errors.js";
import {
  addToPortfolio,
  findPortfolioRowByName,
  listPortfolio,
  removeFromPortfolio,
  type PortfolioRow,
} from "../lib/portfolioRepo.js";

const EMBED_COLOR = 0x9333ea;

function fmtMoney(value: number | null | undefined): string {
  if (value == null) return "—";
  return `$${value.toFixed(2)}`;
}

export const portfolioCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("portfolio")
    .setDescription("Track your trading card collection")
    .addSubcommand((sub) =>
      sub
        .setName("add")
        .setDescription("Add a card to your portfolio")
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
            .setName("qty")
            .setDescription("How many copies you own (default 1)")
            .setRequired(false)
            .setMinValue(0.001)
            .setMaxValue(100000),
        )
        .addNumberOption((opt) =>
          opt
            .setName("purchase_price")
            .setDescription("Per-copy purchase price in USD (for P&L tracking)")
            .setRequired(false)
            .setMinValue(0)
            .setMaxValue(1000000),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName("show").setDescription("Show your portfolio with live valuations"),
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("Remove a card from your portfolio")
        .addStringOption((opt) =>
          opt
            .setName("card")
            .setDescription("Card name (autocompleted from your portfolio)")
            .setRequired(true)
            .setMaxLength(100)
            .setAutocomplete(true),
        ),
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (!interaction.guildId) {
      await interaction.reply({
        content: "Portfolio commands only work inside a server.",
        ephemeral: true,
      });
      return;
    }

    if (sub === "add") return handleAdd(interaction);
    if (sub === "show") return handleShow(interaction);
    if (sub === "remove") return handleRemove(interaction);
  },

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused(true);
    if (focused.name !== "card") {
      await interaction.respond([]);
      return;
    }
    const query = focused.value.trim();
    const sub = interaction.options.getSubcommand();

    // For /portfolio remove, suggest only cards the user actually owns
    // in this server. For /portfolio add, suggest any card from the API.
    if (sub === "remove" && interaction.guildId) {
      const owned = listPortfolio(interaction.user.id, interaction.guildId);
      const matches = owned
        .filter((row) =>
          row.card_name.toLowerCase().includes(query.toLowerCase()),
        )
        .slice(0, 10)
        .map((row) => ({
          name: `${row.card_name} (qty ${row.qty})`.slice(0, 100),
          value: row.card_name.slice(0, 100),
        }));
      await interaction.respond(matches);
      return;
    }

    // /portfolio add — same shape as /price autocomplete.
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

// ============================================================ subcommands

async function handleAdd(
  interaction: Parameters<NonNullable<BotCommand["execute"]>>[0],
): Promise<void> {
  const cardName = interaction.options.getString("card", true);
  const qty = interaction.options.getNumber("qty") ?? 1;
  const purchasePrice = interaction.options.getNumber("purchase_price");

  await interaction.deferReply({ ephemeral: true });

  try {
    // Resolve to a real card via the API so we store the correct ID
    // and the canonical name (not what the user typed).
    const search = await tcg.cards.search({ q: cardName, limit: 1 });
    const card = search.data[0];
    if (!card) {
      await interaction.editReply({ content: `❓ No card found for **${cardName}**.` });
      return;
    }

    addToPortfolio({
      userId: interaction.user.id,
      guildId: interaction.guildId!,
      cardId: card.id,
      cardName: card.name,
      qty,
      purchasePrice: purchasePrice ?? null,
    });

    const market = card.prices?.raw?.near_mint?.tcgplayer?.market;
    const lines = [
      `✅ Added **${qty}× ${card.name}** to your portfolio.`,
      `Set: ${card.set.name}`,
      `Current NM price: ${fmtMoney(market)}`,
    ];
    if (purchasePrice != null) {
      lines.push(`Purchase price: $${purchasePrice.toFixed(2)} per copy`);
    }
    await interaction.editReply({ content: lines.join("\n") });
  } catch (err) {
    await interaction.editReply({ content: describeError(err) });
  }
}

async function handleShow(
  interaction: Parameters<NonNullable<BotCommand["execute"]>>[0],
): Promise<void> {
  await interaction.deferReply();

  const rows = listPortfolio(interaction.user.id, interaction.guildId!);
  if (rows.length === 0) {
    await interaction.editReply({
      content:
        "Your portfolio is empty. Add cards with `/portfolio add card:<name>`.",
    });
    return;
  }

  try {
    // Batch-fetch live prices for every card the user owns. The SDK
    // auto-chunks at 20 IDs per request, so we just pass everything.
    const ids = rows.map((r) => r.card_id);
    const fresh = await tcg.cards.search({ ids, limit: ids.length });
    const priceById = new Map(
      fresh.data.map((c) => [
        c.id,
        c.prices?.raw?.near_mint?.tcgplayer?.market ?? null,
      ]),
    );

    type Holding = PortfolioRow & {
      currentPrice: number | null;
      currentValue: number;
      cost: number | null;
      pnl: number | null;
    };

    const holdings: Holding[] = rows.map((row) => {
      const currentPrice = priceById.get(row.card_id) ?? null;
      const currentValue = currentPrice != null ? currentPrice * row.qty : 0;
      const cost = row.purchase_price != null ? row.purchase_price * row.qty : null;
      const pnl = cost != null && currentPrice != null ? currentValue - cost : null;
      return { ...row, currentPrice, currentValue, cost, pnl };
    });

    holdings.sort((a, b) => b.currentValue - a.currentValue);

    const totalValue = holdings.reduce((sum, h) => sum + h.currentValue, 0);
    const totalCost = holdings.reduce(
      (sum, h) => (h.cost != null ? sum + h.cost : sum),
      0,
    );
    const totalPnl = totalCost > 0 ? totalValue - totalCost : null;

    const top = holdings.slice(0, 10).map((h, i) => {
      const pricePart =
        h.currentPrice != null
          ? `${fmtMoney(h.currentPrice)} × ${h.qty} = **${fmtMoney(h.currentValue)}**`
          : "no price data";
      const pnlPart =
        h.pnl != null
          ? ` · ${h.pnl >= 0 ? "+" : ""}${fmtMoney(h.pnl)}`
          : "";
      return `**${i + 1}.** ${h.card_name} — ${pricePart}${pnlPart}`;
    });

    const embed = new EmbedBuilder()
      .setColor(EMBED_COLOR)
      .setTitle(`${interaction.user.username}'s portfolio`)
      .setDescription(top.join("\n"))
      .addFields({
        name: "Total value",
        value: `**${fmtMoney(totalValue)}** across ${rows.length} card${rows.length === 1 ? "" : "s"}`,
        inline: true,
      })
      .setFooter({ text: "TCG Price Lookup · tcgpricelookup.com" });

    if (totalPnl != null) {
      const pct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;
      const arrow = totalPnl >= 0 ? "↑" : "↓";
      embed.addFields({
        name: "P&L",
        value: `${arrow} **${fmtMoney(Math.abs(totalPnl))}** (${pct.toFixed(1)}%) vs purchase`,
        inline: true,
      });
    }

    if (rows.length > 10) {
      embed.addFields({
        name: "Showing",
        value: `Top 10 of ${rows.length} holdings.`,
      });
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    await interaction.editReply({ content: describeError(err) });
  }
}

async function handleRemove(
  interaction: Parameters<NonNullable<BotCommand["execute"]>>[0],
): Promise<void> {
  const cardName = interaction.options.getString("card", true);

  const row = findPortfolioRowByName(
    interaction.user.id,
    interaction.guildId!,
    cardName,
  );
  if (!row) {
    await interaction.reply({
      content: `❓ You don't have **${cardName}** in your portfolio.`,
      ephemeral: true,
    });
    return;
  }

  removeFromPortfolio(interaction.user.id, interaction.guildId!, row.card_id);
  await interaction.reply({
    content: `✅ Removed **${row.card_name}** from your portfolio.`,
    ephemeral: true,
  });
}
