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

import { AttachmentBuilder, EmbedBuilder, SlashCommandBuilder } from "discord.js";
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
    )
    .addSubcommand((sub) =>
      sub
        .setName("export")
        .setDescription("Download your portfolio as JSON or CSV")
        .addStringOption((opt) =>
          opt
            .setName("format")
            .setDescription("Output format (default: json)")
            .setRequired(false)
            .addChoices(
              { name: "JSON", value: "json" },
              { name: "CSV", value: "csv" },
            ),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("import")
        .setDescription("Bulk-add cards from a multiline list")
        .addStringOption((opt) =>
          opt
            .setName("cards")
            .setDescription(
              "One card per line. Format: '<qty> <name>' or '<qty> <name> @ <price>'",
            )
            .setRequired(true)
            .setMaxLength(2000),
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
    if (sub === "export") return handleExport(interaction);
    if (sub === "import") return handleImport(interaction);
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

// ============================================================ export

async function handleExport(
  interaction: Parameters<NonNullable<BotCommand["execute"]>>[0],
): Promise<void> {
  const format = interaction.options.getString("format") ?? "json";
  const rows = listPortfolio(interaction.user.id, interaction.guildId!);

  if (rows.length === 0) {
    await interaction.reply({
      content: "Your portfolio is empty — nothing to export.",
      ephemeral: true,
    });
    return;
  }

  const filename = `portfolio-${interaction.user.id}-${Date.now()}.${format}`;
  let body: string;

  if (format === "csv") {
    // Standard CSV: header row + one row per holding. Card names are
    // wrapped in quotes and any internal quote is doubled per RFC 4180.
    const lines = ["card_id,card_name,qty,purchase_price,added_at"];
    for (const row of rows) {
      const escapedName = `"${row.card_name.replace(/"/g, '""')}"`;
      lines.push(
        [
          row.card_id,
          escapedName,
          row.qty,
          row.purchase_price ?? "",
          row.added_at,
        ].join(","),
      );
    }
    body = lines.join("\n");
  } else {
    // JSON: pretty-printed array of plain objects, no internal SQL ids.
    body = JSON.stringify(
      rows.map((row) => ({
        card_id: row.card_id,
        card_name: row.card_name,
        qty: row.qty,
        purchase_price: row.purchase_price,
        added_at: row.added_at,
      })),
      null,
      2,
    );
  }

  const attachment = new AttachmentBuilder(Buffer.from(body, "utf-8"), {
    name: filename,
    description: `Portfolio export — ${rows.length} cards`,
  });

  await interaction.reply({
    content: `📥 Your portfolio (${rows.length} cards):`,
    files: [attachment],
    ephemeral: true,
  });
}

// ============================================================ import

/**
 * Parse one input line into a (qty, name, optional price) tuple.
 *
 * Accepted formats (very forgiving — collectors paste from many
 * different sources):
 *
 *   "Charizard"
 *   "3 Charizard"
 *   "3x Charizard"
 *   "Charizard x3"
 *   "3 Charizard @ 100"
 *   "3 Charizard @ $100"
 *   "3x Charizard $100"
 *
 * Returns null if the line is empty or only whitespace.
 */
function parseImportLine(rawLine: string): { qty: number; name: string; price: number | null } | null {
  const line = rawLine.trim();
  if (!line) return null;

  // Strip an optional "@ price" or trailing "$price" suffix first.
  let priceMatch = line.match(/\s+@\s*\$?([0-9]+(?:\.[0-9]+)?)$/);
  let priceStr: string | null = priceMatch?.[1] ?? null;
  let withoutPrice = priceMatch ? line.slice(0, priceMatch.index) : line;
  if (!priceMatch) {
    priceMatch = withoutPrice.match(/\s+\$([0-9]+(?:\.[0-9]+)?)$/);
    if (priceMatch) {
      priceStr = priceMatch[1] ?? null;
      withoutPrice = withoutPrice.slice(0, priceMatch.index);
    }
  }

  withoutPrice = withoutPrice.trim();
  if (!withoutPrice) return null;

  // Try to peel a leading "<n>" or "<n>x" quantity.
  let qty = 1;
  let name = withoutPrice;
  const leading = withoutPrice.match(/^(\d+)\s*x?\s+(.*)$/i);
  if (leading) {
    qty = parseInt(leading[1]!, 10);
    name = (leading[2] ?? "").trim();
  } else {
    // Or a trailing "x<n>" / "X<n>" quantity.
    const trailing = withoutPrice.match(/^(.*)\s+x\s*(\d+)$/i);
    if (trailing) {
      qty = parseInt(trailing[2]!, 10);
      name = (trailing[1] ?? "").trim();
    }
  }

  if (!name || !Number.isFinite(qty) || qty <= 0) return null;
  const price = priceStr != null ? parseFloat(priceStr) : null;
  return { qty, name, price };
}

async function handleImport(
  interaction: Parameters<NonNullable<BotCommand["execute"]>>[0],
): Promise<void> {
  const raw = interaction.options.getString("cards", true);
  const lines = raw.split(/\r?\n/);

  await interaction.deferReply({ ephemeral: true });

  // Phase 1: parse every line. Track skipped lines so we can report.
  const parsed: Array<{ qty: number; name: string; price: number | null }> = [];
  const skipped: string[] = [];
  for (const rawLine of lines) {
    const result = parseImportLine(rawLine);
    if (result) {
      parsed.push(result);
    } else if (rawLine.trim()) {
      skipped.push(rawLine.trim());
    }
  }

  if (parsed.length === 0) {
    await interaction.editReply({
      content:
        "❓ Couldn't parse any lines. Use one card per line like `3 Charizard` or `3 Charizard @ 100`.",
    });
    return;
  }

  // Phase 2: resolve every name in parallel via cards.search.
  // We cap parallelism at 8 so we don't slam the API on huge pastes.
  const resolved: Array<{
    parsed: { qty: number; name: string; price: number | null };
    cardId: string | null;
    cardName: string | null;
  }> = [];

  const concurrency = 8;
  for (let i = 0; i < parsed.length; i += concurrency) {
    const batch = parsed.slice(i, i + concurrency);
    const results = await Promise.all(
      batch.map(async (entry) => {
        try {
          const search = await tcg.cards.search({ q: entry.name, limit: 1 });
          const card = search.data[0];
          return {
            parsed: entry,
            cardId: card?.id ?? null,
            cardName: card?.name ?? null,
          };
        } catch {
          return { parsed: entry, cardId: null, cardName: null };
        }
      }),
    );
    resolved.push(...results);
  }

  // Phase 3: persist resolved hits, collect unresolved names.
  let added = 0;
  const unresolved: string[] = [];
  for (const entry of resolved) {
    if (!entry.cardId || !entry.cardName) {
      unresolved.push(entry.parsed.name);
      continue;
    }
    addToPortfolio({
      userId: interaction.user.id,
      guildId: interaction.guildId!,
      cardId: entry.cardId,
      cardName: entry.cardName,
      qty: entry.parsed.qty,
      purchasePrice: entry.parsed.price,
    });
    added++;
  }

  const summary = [`✅ Imported **${added}** card${added === 1 ? "" : "s"}.`];
  if (unresolved.length > 0) {
    summary.push(
      `⚠️ Couldn't resolve ${unresolved.length}: ${unresolved.slice(0, 10).join(", ")}${unresolved.length > 10 ? "…" : ""}`,
    );
  }
  if (skipped.length > 0) {
    summary.push(`⚠️ Skipped ${skipped.length} unparseable line${skipped.length === 1 ? "" : "s"}.`);
  }
  summary.push("\nRun `/portfolio show` to see the updated holdings.");
  await interaction.editReply({ content: summary.join("\n") });
}
