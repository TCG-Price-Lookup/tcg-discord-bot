/**
 * /price — search trading card prices by name.
 *
 * If the search returns exactly one card, we render the full detail
 * embed. Otherwise we show a top-N results list with headline prices.
 */

import { SlashCommandBuilder } from "discord.js";
import type { BotCommand } from "./index.js";
import { tcg, GAME_LABELS, type GameSlug } from "../lib/sdk.js";
import { cardEmbed, searchResultsEmbed } from "../lib/format.js";
import { describeError } from "../lib/errors.js";

export const priceCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("price")
    .setDescription("Look up live trading card prices across every major TCG")
    .addStringOption((opt) =>
      opt
        .setName("card")
        .setDescription("Card name (e.g. 'charizard', 'black lotus')")
        .setRequired(true)
        .setMaxLength(100),
    )
    .addStringOption((opt) =>
      opt
        .setName("game")
        .setDescription("Filter to a specific game")
        .setRequired(false)
        .addChoices(
          ...Object.entries(GAME_LABELS).map(([value, name]) => ({
            name,
            value,
          })),
        ),
    ),

  async execute(interaction) {
    const query = interaction.options.getString("card", true);
    const game = (interaction.options.getString("game") ?? undefined) as
      | GameSlug
      | undefined;

    // Defer immediately — the API call usually takes 200-800ms which
    // is longer than Discord's 3-second initial-response window allows
    // when the bot is under any load.
    await interaction.deferReply();

    try {
      const results = await tcg.cards.search({
        q: query,
        game,
        limit: 10,
      });

      // Exact match → render the detail embed for the top hit.
      if (results.data.length === 1) {
        await interaction.editReply({ embeds: [cardEmbed(results.data[0]!)] });
        return;
      }

      // Multiple matches → list embed.
      await interaction.editReply({
        embeds: [searchResultsEmbed(query, results.data, results.total, game)],
      });
    } catch (err) {
      await interaction.editReply({ content: describeError(err) });
    }
  },
};
