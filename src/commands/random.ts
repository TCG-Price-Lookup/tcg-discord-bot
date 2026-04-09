/**
 * /random — show a random card from the catalogue.
 *
 * Pure entertainment / discovery feature. Helps users stumble onto
 * cards they'd never search for and gives the bot some "personality"
 * in low-traffic servers.
 *
 * Implementation note: the API doesn't expose a dedicated "random"
 * endpoint, so we approximate by picking a random offset within the
 * total result count for an empty/single-game search. The offset is
 * capped at 9_999 to stay inside the API's pagination window — for
 * games with 10K+ cards we still cover the most popular slice.
 */

import { EmbedBuilder, SlashCommandBuilder } from "discord.js";
import type { BotCommand } from "./index.js";
import { tcg, GAME_LABELS, type GameSlug } from "../lib/sdk.js";
import { cardEmbed } from "../lib/format.js";
import { describeError } from "../lib/errors.js";

/** API pagination cap. We probe with a small limit, then re-fetch one card. */
const MAX_OFFSET = 9_999;

export const randomCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("random")
    .setDescription("Show a random trading card from the catalogue")
    .addStringOption((opt) =>
      opt
        .setName("game")
        .setDescription("Pick a random card from a specific game")
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
      // Step 1: a 1-card probe so we know the total result size for
      // the chosen game (or whole catalogue). The API returns `total`
      // on every paginated response, which is what we actually need.
      const probe = await tcg.cards.search({ game, limit: 1, offset: 0 });
      const total = probe.total;
      if (total === 0) {
        await interaction.editReply({
          content: "No cards available for that filter — try without `game`.",
        });
        return;
      }

      // Step 2: pick a random offset and fetch a single card from there.
      const cap = Math.min(total, MAX_OFFSET);
      const offset = Math.floor(Math.random() * cap);
      const pick = await tcg.cards.search({ game, limit: 1, offset });
      const card = pick.data[0];
      if (!card) {
        // Extremely unlikely race (catalogue shrunk between calls).
        // Fall back to whatever the probe returned.
        const fallback = probe.data[0];
        if (!fallback) {
          await interaction.editReply({ content: "Couldn't fetch a random card. Try again." });
          return;
        }
        await interaction.editReply({ embeds: [cardEmbed(fallback)] });
        return;
      }

      // Lead-in line above the card embed so it's clear this isn't a
      // search match — it's a random pull.
      const intro = game
        ? `🎲 Random **${GAME_LABELS[game]}** card:`
        : "🎲 Random card from any game:";
      await interaction.editReply({
        content: intro,
        embeds: [cardEmbed(card)],
      });
    } catch (err) {
      await interaction.editReply({ content: describeError(err) });
    }
  },
};

/** Re-export the embed type so other commands can build on the same shape. */
export type { EmbedBuilder };
