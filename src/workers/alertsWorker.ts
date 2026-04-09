/**
 * Alerts worker.
 *
 * Polls every active alert against the live API and fires a DM (or
 * channel post) when the threshold is crossed. Runs on a fixed cron
 * schedule via lib/scheduler.
 *
 * Strategy:
 *
 *   1. Read every active (non-paused) alert from SQLite.
 *   2. Collect the unique card IDs across all alerts. The SDK
 *      auto-chunks at 20 IDs, so we just hand it the whole list.
 *   3. For each alert, look up the corresponding card's current NM
 *      TCGPlayer market price and compare to the alert's threshold.
 *   4. If the threshold is crossed AND the alert hasn't fired in the
 *      last 24h, send the notification and mark it as triggered.
 *
 * The 24h cool-down is critical — without it, a card sitting just
 * past a threshold would spam the user every poll.
 */

import { EmbedBuilder, type Client, type TextChannel } from "discord.js";
import {
  listAllActiveAlerts,
  markAlertTriggered,
  type AlertRow,
} from "../lib/alertRepo.js";
import { tcg } from "../lib/sdk.js";
import { registerJob } from "../lib/scheduler.js";
import { now } from "../lib/db.js";

const COOLDOWN_SECS = 24 * 60 * 60;
const EMBED_COLOR = 0x9333ea;

/**
 * Run a single sweep over every active alert. Exported for testing
 * and for an optional manual trigger from a debug command.
 */
export async function runAlertsSweep(client: Client): Promise<void> {
  const alerts = listAllActiveAlerts();
  if (alerts.length === 0) return;

  // Deduplicate the card IDs we need to fetch.
  const uniqueIds = Array.from(new Set(alerts.map((a) => a.card_id)));

  let priceById: Map<string, number | null>;
  try {
    const fresh = await tcg.cards.search({ ids: uniqueIds, limit: uniqueIds.length });
    priceById = new Map(
      fresh.data.map((c) => [
        c.id,
        c.prices?.raw?.near_mint?.tcgplayer?.market ?? null,
      ]),
    );
  } catch (err) {
    console.error("[alertsWorker] price fetch failed:", err);
    return;
  }

  const ts = now();
  for (const alert of alerts) {
    const currentPrice = priceById.get(alert.card_id);
    if (currentPrice == null) continue;

    const crossed =
      alert.direction === "above"
        ? currentPrice >= alert.threshold
        : currentPrice <= alert.threshold;
    if (!crossed) continue;

    // Cool-down check: don't re-fire within 24h of the last trigger.
    if (
      alert.last_triggered_at != null &&
      ts - alert.last_triggered_at < COOLDOWN_SECS
    ) {
      continue;
    }

    try {
      await deliverAlert(client, alert, currentPrice);
      markAlertTriggered(alert.id);
    } catch (err) {
      console.error(`[alertsWorker] delivery failed for alert ${alert.id}:`, err);
    }
  }
}

/** Send the actual notification — DM or channel post. */
async function deliverAlert(
  client: Client,
  alert: AlertRow,
  currentPrice: number,
): Promise<void> {
  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setTitle(`🔔 Price alert: ${alert.card_name}`)
    .setURL(`https://tcgpricelookup.com/card/${alert.card_id}`)
    .setDescription(
      `**${alert.card_name}** is now **$${currentPrice.toFixed(2)}** ` +
        `(${alert.direction === "above" ? "above" : "below"} your threshold of $${alert.threshold.toFixed(2)})`,
    )
    .setFooter({
      text: "TCG Price Lookup · Run /alert list to manage your alerts",
    });

  if (alert.channel_id) {
    // Channel post — useful for finance-themed servers where everyone
    // wants to see big moves.
    const channel = await client.channels.fetch(alert.channel_id).catch(() => null);
    if (channel?.isTextBased() && "send" in channel) {
      await (channel as TextChannel).send({
        content: `<@${alert.user_id}>`,
        embeds: [embed],
      });
      return;
    }
  }

  // Default: DM the user.
  const user = await client.users.fetch(alert.user_id).catch(() => null);
  if (user) {
    await user.send({ embeds: [embed] }).catch((err) => {
      // Users can disable DMs from server members. We log and move on.
      console.error(`[alertsWorker] could not DM ${alert.user_id}:`, err);
    });
  }
}

// Register the job at module load. Default schedule: every hour.
// Override with the ALERTS_CRON env var if you want faster polling.
registerJob({
  name: "alerts",
  cron: process.env.ALERTS_CRON ?? "0 * * * *",
  handler: runAlertsSweep,
});
