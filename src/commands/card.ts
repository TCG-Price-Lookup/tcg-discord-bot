/**
 * /card — fetch a single card by its UUID.
 *
 * The UUID is the `id` field returned in any `/price` result. Use this
 * when you want the full price block (every condition, eBay sold data,
 * graded prices) for a specific card.
 */

import { SlashCommandBuilder } from "discord.js";
import type { BotCommand } from "./index.js";
import { tcg } from "../lib/sdk.js";
import { cardEmbed } from "../lib/format.js";
import { describeError } from "../lib/errors.js";

export const cardCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("card")
    .setDescription("Fetch a single card by its TCG Price Lookup ID (UUID)")
    .addStringOption((opt) =>
      opt
        .setName("id")
        .setDescription("Card UUID (from a previous /price result)")
        .setRequired(true)
        .setMinLength(36)
        .setMaxLength(36),
    ),

  async execute(interaction) {
    const id = interaction.options.getString("id", true);
    await interaction.deferReply();

    try {
      const card = await tcg.cards.get(id);
      await interaction.editReply({ embeds: [cardEmbed(card)] });
    } catch (err) {
      await interaction.editReply({ content: describeError(err) });
    }
  },
};
