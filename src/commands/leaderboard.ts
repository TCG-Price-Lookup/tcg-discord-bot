/**
 * /leaderboard — server-wide rankings.
 *
 * Subcommands:
 *
 *   /leaderboard portfolios — top portfolio holders by current value
 *   /leaderboard cards      — most-watched cards (highest active alert count)
 *
 * Both views are scoped to the current guild. Portfolios live-revalues
 * every holding by batch-fetching prices, then sums per user.
 */

import { EmbedBuilder, SlashCommandBuilder } from "discord.js";
import type { BotCommand } from "./index.js";
import { db } from "../lib/db.js";
import { tcg } from "../lib/sdk.js";
import { describeError } from "../lib/errors.js";

const EMBED_COLOR = 0x9333ea;

interface UserHoldingRow {
  user_id: string;
  card_id: string;
  qty: number;
}

interface CardWatchRow {
  card_id: string;
  card_name: string;
  watcher_count: number;
}

const allHoldingsForGuildStmt = db.prepare(`
  SELECT user_id, card_id, qty
  FROM portfolios
  WHERE guild_id = ?
`);

const topWatchedCardsStmt = db.prepare(`
  SELECT card_id, card_name, COUNT(DISTINCT user_id) as watcher_count
  FROM alerts
  WHERE guild_id = ? AND paused = 0
  GROUP BY card_id, card_name
  ORDER BY watcher_count DESC
  LIMIT 10
`);

export const leaderboardCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("Server-wide rankings: top portfolios + most-watched cards")
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName("portfolios")
        .setDescription("Top portfolio holders in this server, ranked by total value"),
    )
    .addSubcommand((sub) =>
      sub
        .setName("cards")
        .setDescription("Cards with the most active alerts in this server"),
    ),

  async execute(interaction) {
    if (!interaction.guildId) {
      await interaction.reply({
        content: "/leaderboard only works inside a server.",
        ephemeral: true,
      });
      return;
    }

    const sub = interaction.options.getSubcommand();
    if (sub === "portfolios") return handlePortfolios(interaction);
    if (sub === "cards") return handleCards(interaction);
  },
};

async function handlePortfolios(
  interaction: Parameters<NonNullable<BotCommand["execute"]>>[0],
): Promise<void> {
  await interaction.deferReply();

  const rows = allHoldingsForGuildStmt.all(
    interaction.guildId,
  ) as UserHoldingRow[];
  if (rows.length === 0) {
    await interaction.editReply({
      content:
        "No portfolios in this server yet. Get started with `/portfolio add`.",
    });
    return;
  }

  try {
    // Batch-fetch prices for every unique card across every user.
    const uniqueIds = Array.from(new Set(rows.map((r) => r.card_id)));
    const fresh = await tcg.cards.search({ ids: uniqueIds, limit: uniqueIds.length });
    const priceById = new Map(
      fresh.data.map((c) => [
        c.id,
        c.prices?.raw?.near_mint?.tcgplayer?.market ?? 0,
      ]),
    );

    // Sum value per user.
    const valueByUser = new Map<string, number>();
    for (const row of rows) {
      const price = priceById.get(row.card_id) ?? 0;
      valueByUser.set(
        row.user_id,
        (valueByUser.get(row.user_id) ?? 0) + price * row.qty,
      );
    }

    const ranked = Array.from(valueByUser.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    const lines = ranked.map(([userId, value], i) => {
      const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `**${i + 1}.**`;
      return `${medal} <@${userId}> — **$${value.toFixed(2)}**`;
    });

    const embed = new EmbedBuilder()
      .setColor(EMBED_COLOR)
      .setTitle("🏆 Top portfolios in this server")
      .setDescription(lines.join("\n"))
      .setFooter({
        text: `${valueByUser.size} portfolio${valueByUser.size === 1 ? "" : "s"} · live valuations`,
      });

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    await interaction.editReply({ content: describeError(err) });
  }
}

async function handleCards(
  interaction: Parameters<NonNullable<BotCommand["execute"]>>[0],
): Promise<void> {
  const rows = topWatchedCardsStmt.all(interaction.guildId) as CardWatchRow[];
  if (rows.length === 0) {
    await interaction.reply({
      content:
        "No active alerts in this server yet. Set one up with `/alert add`.",
      ephemeral: true,
    });
    return;
  }

  const lines = rows.map((row, i) => {
    const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `**${i + 1}.**`;
    return `${medal} **${row.card_name}** — ${row.watcher_count} watcher${row.watcher_count === 1 ? "" : "s"}`;
  });

  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setTitle("👀 Most-watched cards in this server")
    .setDescription(lines.join("\n"))
    .setFooter({ text: "Based on active /alert subscriptions" });

  await interaction.reply({ embeds: [embed] });
}
