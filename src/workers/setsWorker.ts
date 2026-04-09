/**
 * Set release notification worker.
 *
 * Polls the /sets endpoint daily, diffs against the known_sets table,
 * and posts an announcement to every guild that has a set release
 * channel configured.
 *
 * Bootstrap behaviour: on the very first run after install, the
 * known_sets table is empty. We back-fill it without sending any
 * notifications so the bot doesn't spam every guild with hundreds of
 * "new set" posts on day one.
 */

import { EmbedBuilder, type Client, type TextChannel } from "discord.js";
import { tcg, GAME_LABELS, type GameSlug } from "../lib/sdk.js";
import {
  getKnownSetIds,
  knownSetCount,
  recordKnownSet,
} from "../lib/setsRepo.js";
import { listAllServerConfigs } from "../lib/serverConfig.js";
import { registerJob } from "../lib/scheduler.js";

const EMBED_COLOR = 0x9333ea;

/** Pull the full set list from the API. Pages through if needed. */
async function fetchAllSets(): Promise<
  Array<{ id: string; slug: string; name: string; game: string; count: number }>
> {
  // The API caps page size at 200 and most games have < 200 sets each.
  // We page until we've collected the reported total.
  const all: Array<{ id: string; slug: string; name: string; game: string; count: number }> = [];
  let offset = 0;
  while (true) {
    const page = await tcg.sets.list({ limit: 200, offset });
    all.push(...page.data);
    if (all.length >= page.total || page.data.length === 0) break;
    offset += page.data.length;
    if (offset > 5000) break; // hard safety stop
  }
  return all;
}

/**
 * Run a single sweep over the /sets endpoint, diff, and post.
 * Exported for testing or manual invocation.
 */
export async function runSetsSweep(client: Client): Promise<void> {
  let sets;
  try {
    sets = await fetchAllSets();
  } catch (err) {
    console.error("[setsWorker] sets fetch failed:", err);
    return;
  }

  // Bootstrap: if we've never seen any sets, back-fill silently so
  // we don't fire hundreds of "new set" notifications on day one.
  if (knownSetCount() === 0) {
    for (const s of sets) {
      recordKnownSet({ setId: s.id, game: s.game, name: s.name });
    }
    console.log(`[setsWorker] bootstrap: recorded ${sets.length} existing sets`);
    return;
  }

  const known = getKnownSetIds();
  const newSets = sets.filter((s) => !known.has(s.id));
  if (newSets.length === 0) return;

  console.log(`[setsWorker] found ${newSets.length} new set(s)`);

  // Find every guild that wants set release notifications.
  const targets = listAllServerConfigs().filter(
    (c) => c.set_release_channel_id != null,
  );

  for (const newSet of newSets) {
    const game = GAME_LABELS[newSet.game as GameSlug] ?? newSet.game;
    const embed = new EmbedBuilder()
      .setColor(EMBED_COLOR)
      .setTitle(`🎴 New set: ${newSet.name}`)
      .setURL(`https://tcgpricelookup.com/${newSet.game}/${newSet.slug}`)
      .setDescription(`**${game}** · ${newSet.count.toLocaleString()} cards available`)
      .setFooter({
        text: "TCG Price Lookup · /config notify-set-releases",
      });

    for (const target of targets) {
      try {
        const channel = await client.channels
          .fetch(target.set_release_channel_id!)
          .catch(() => null);
        if (channel?.isTextBased() && "send" in channel) {
          await (channel as TextChannel).send({ embeds: [embed] });
        }
      } catch (err) {
        console.error(
          `[setsWorker] notify failed for guild ${target.guild_id}:`,
          err,
        );
      }
    }

    // Record after notifying so a crash mid-sweep can resume safely.
    recordKnownSet({ setId: newSet.id, game: newSet.game, name: newSet.name });
  }
}

// Daily at 14:00 UTC (avoid the top-of-hour traffic spike). Override
// via the SETS_CRON env var if you need a different cadence.
registerJob({
  name: "sets",
  cron: process.env.SETS_CRON ?? "0 14 * * *",
  handler: runSetsSweep,
});
