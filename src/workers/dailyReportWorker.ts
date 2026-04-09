/**
 * Daily market report worker.
 *
 * For every guild that opted in via `/config daily-report`, posts a
 * daily summary embed to the configured channel:
 *
 *   - One featured "card of the day" (random pull from the catalogue)
 *   - Top 3 most-watched cards in that specific server (from /alert)
 *   - Top 3 portfolio holders in that server (if portfolios exist)
 *
 * The featured card uses the same approach as /random — probe + random
 * offset within the API's pagination window. The other two sections
 * read from the local SQLite tables, so they're free.
 *
 * The report is intentionally lightweight (no heavy live re-pricing
 * sweep) so it stays cheap to fan out to many guilds.
 */

import { EmbedBuilder, type Client, type TextChannel } from "discord.js";
import { tcg, GAME_LABELS, type GameSlug } from "../lib/sdk.js";
import { db } from "../lib/db.js";
import { listAllServerConfigs } from "../lib/serverConfig.js";
import { registerJob } from "../lib/scheduler.js";

const EMBED_COLOR = 0x9333ea;
const MAX_OFFSET = 9_999;

interface CardWatchRow {
  card_name: string;
  watcher_count: number;
}

interface PortfolioAggregateRow {
  user_id: string;
  total_qty: number;
}

const topWatchedStmt = db.prepare(`
  SELECT card_name, COUNT(DISTINCT user_id) as watcher_count
  FROM alerts
  WHERE guild_id = ? AND paused = 0
  GROUP BY card_name
  ORDER BY watcher_count DESC
  LIMIT 3
`);

const topPortfoliosStmt = db.prepare(`
  SELECT user_id, SUM(qty) as total_qty
  FROM portfolios
  WHERE guild_id = ?
  GROUP BY user_id
  ORDER BY total_qty DESC
  LIMIT 3
`);

/** Random card pull, mirroring /random with no game filter. */
async function pickFeaturedCard() {
  const probe = await tcg.cards.search({ limit: 1, offset: 0 });
  const total = probe.total;
  if (total === 0) return null;
  const cap = Math.min(total, MAX_OFFSET);
  const offset = Math.floor(Math.random() * cap);
  const pick = await tcg.cards.search({ limit: 1, offset });
  return pick.data[0] ?? probe.data[0] ?? null;
}

/** Build a daily report embed for a single guild. */
async function buildReport(
  guildId: string,
): Promise<EmbedBuilder | null> {
  const featured = await pickFeaturedCard();
  if (!featured) return null;

  const game = GAME_LABELS[featured.game.slug as GameSlug] ?? featured.game.name;
  const market = featured.prices?.raw?.near_mint?.tcgplayer?.market;
  const featuredLine =
    `[${featured.name}](https://tcgpricelookup.com/card/${featured.id}) — ${featured.set.name} (${game})\n` +
    `NM TCGPlayer: **${market != null ? `$${market.toFixed(2)}` : "—"}**`;

  const watched = topWatchedStmt.all(guildId) as CardWatchRow[];
  const watchedField =
    watched.length > 0
      ? watched
          .map((w, i) => `**${i + 1}.** ${w.card_name} — ${w.watcher_count} watcher${w.watcher_count === 1 ? "" : "s"}`)
          .join("\n")
      : "_no active alerts in this server_";

  const portfolios = topPortfoliosStmt.all(guildId) as PortfolioAggregateRow[];
  const portfoliosField =
    portfolios.length > 0
      ? portfolios
          .map((p, i) => `**${i + 1}.** <@${p.user_id}> — ${p.total_qty} card${p.total_qty === 1 ? "" : "s"}`)
          .join("\n")
      : "_no portfolios yet_";

  const today = new Date().toISOString().slice(0, 10);

  return new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setTitle(`📅 Daily TCG report — ${today}`)
    .setURL("https://tcgpricelookup.com")
    .addFields(
      { name: "🎴 Card of the day", value: featuredLine, inline: false },
      { name: "👀 Most-watched cards", value: watchedField, inline: true },
      { name: "📦 Top portfolios", value: portfoliosField, inline: true },
    )
    .setFooter({
      text: "TCG Price Lookup · /config daily-report enabled:false to stop",
    });
}

/** Run a single sweep — fan out reports to every opted-in guild. */
export async function runDailyReportSweep(client: Client): Promise<void> {
  const targets = listAllServerConfigs().filter(
    (c) => c.daily_report_enabled && c.daily_report_channel_id,
  );
  if (targets.length === 0) return;

  console.log(`[dailyReport] posting to ${targets.length} guild(s)`);

  for (const target of targets) {
    try {
      const embed = await buildReport(target.guild_id);
      if (!embed) continue;
      const channel = await client.channels
        .fetch(target.daily_report_channel_id!)
        .catch(() => null);
      if (channel?.isTextBased() && "send" in channel) {
        await (channel as TextChannel).send({ embeds: [embed] });
      }
    } catch (err) {
      console.error(
        `[dailyReport] failed for guild ${target.guild_id}:`,
        err,
      );
    }
  }
}

// Daily at 09:00 UTC. Override via DAILY_REPORT_CRON.
registerJob({
  name: "dailyReport",
  cron: process.env.DAILY_REPORT_CRON ?? "0 9 * * *",
  handler: runDailyReportSweep,
});
