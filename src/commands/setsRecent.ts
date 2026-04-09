/**
 * /sets-recent — list the most recently released sets.
 *
 * The API doesn't expose a "sort by release date" parameter directly,
 * so we fetch a generous slice of sets (filtered by game when given)
 * and sort client-side. This is fine because the per-game set list
 * is bounded by the game's history — even MTG only has ~250 sets.
 *
 * Sets without a `released_at` value are sorted last (we can't rank
 * them) and clearly labelled in the embed.
 */

import { EmbedBuilder, SlashCommandBuilder } from "discord.js";
import type { BotCommand } from "./index.js";
import { tcg, GAME_LABELS, type GameSlug } from "../lib/sdk.js";
import { describeError } from "../lib/errors.js";

const EMBED_COLOR = 0x9333ea;
const PAGE = 10;

export const setsRecentCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("sets-recent")
    .setDescription("Show the most recently released sets")
    .addStringOption((opt) =>
      opt
        .setName("game")
        .setDescription("Filter to a specific game (default: all games)")
        .setRequired(false)
        .addChoices(
          ...Object.entries(GAME_LABELS).map(([value, name]) => ({
            name,
            value,
          })),
        ),
    ),

  async execute(interaction) {
    const game = (interaction.options.getString("game") ?? undefined) as
      | GameSlug
      | undefined;

    await interaction.deferReply();

    try {
      // Pull a generous slice. The API caps page size at 200; for
      // single-game queries that's enough to cover any game's full
      // history. For "all games" we just take the first page since
      // we only care about the top 10 anyway.
      const result = await tcg.sets.list({ game, limit: 200 });

      // Sort by release date descending. Sets without a date go last.
      const sorted = [...result.data].sort((a, b) => {
        if (!a.released_at && !b.released_at) return 0;
        if (!a.released_at) return 1;
        if (!b.released_at) return -1;
        return b.released_at.localeCompare(a.released_at);
      });

      const top = sorted.slice(0, PAGE);
      if (top.length === 0) {
        await interaction.editReply({ content: "No sets available for that filter." });
        return;
      }

      const lines = top.map((set, i) => {
        const date = set.released_at ?? "release date unknown";
        const gameLabel = GAME_LABELS[set.game as GameSlug] ?? set.game;
        return (
          `**${i + 1}.** [${set.name}](https://tcgpricelookup.com/${set.game}/${set.slug}) — ${gameLabel}\n` +
          `   ${date} · ${set.count.toLocaleString()} cards`
        );
      });

      const title = game
        ? `Most recent ${GAME_LABELS[game]} sets`
        : "Most recent set releases (all games)";

      const embed = new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setTitle(title)
        .setURL("https://tcgpricelookup.com/sets")
        .setDescription(lines.join("\n\n"))
        .setFooter({
          text: `Showing ${top.length} of ${result.total} sets · TCG Price Lookup`,
        });

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      await interaction.editReply({ content: describeError(err) });
    }
  },
};
