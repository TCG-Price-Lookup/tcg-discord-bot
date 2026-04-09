/**
 * /games — list every supported trading card game with its catalog size.
 */

import { EmbedBuilder, SlashCommandBuilder } from "discord.js";
import type { BotCommand } from "./index.js";
import { tcg } from "../lib/sdk.js";
import { describeError } from "../lib/errors.js";

export const gamesCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("games")
    .setDescription("List every trading card game supported by the bot"),

  async execute(interaction) {
    await interaction.deferReply();

    try {
      const result = await tcg.games.list({ limit: 50 });
      const lines = result.data
        .map((g) => `**${g.name}** \`${g.slug}\` — ${g.count.toLocaleString()} cards`)
        .join("\n");

      const embed = new EmbedBuilder()
        .setColor(0x9333ea)
        .setTitle("Supported games")
        .setURL("https://tcgpricelookup.com/catalog")
        .setDescription(lines)
        .setFooter({
          text: `${result.total} games · TCG Price Lookup`,
        });

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      await interaction.editReply({ content: describeError(err) });
    }
  },
};
