/**
 * /help — bot usage and credits.
 */

import { EmbedBuilder, SlashCommandBuilder } from "discord.js";
import type { BotCommand } from "./index.js";

export const helpCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("help")
    .setDescription("How to use the TCG Price Lookup bot"),

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setColor(0x9333ea)
      .setTitle("TCG Price Lookup bot")
      .setURL("https://tcgpricelookup.com")
      .setDescription(
        "Live trading card prices for **Pokémon, Magic: The Gathering, Yu-Gi-Oh!, Disney Lorcana, One Piece TCG, Star Wars: Unlimited,** and **Flesh and Blood** — directly in Discord.",
      )
      .addFields(
        {
          name: "/price <card> [game]",
          value:
            "Search any card by name. Optionally filter by game. Returns top results with TCGPlayer market prices.\n*Example:* `/price card:charizard game:Pokémon`",
        },
        {
          name: "/card <id>",
          value:
            "Fetch a specific card by UUID (use the IDs from `/price` results) for the full price block — every condition, eBay sold averages, and PSA / BGS / CGC graded comps.",
        },
        {
          name: "/games",
          value: "Show every supported trading card game and how many cards are tracked for each.",
        },
        {
          name: "Free vs Trader",
          value:
            "The Free plan returns TCGPlayer market prices. The **Trader** plan unlocks eBay sold averages, graded card prices, and 1-year history. The bot operator controls the plan.\n[Compare plans →](https://tcgpricelookup.com/pricing)",
        },
        {
          name: "Run your own bot",
          value:
            "This bot is open source. Self-host it for your community in 5 minutes — see [github.com/TCG-Price-Lookup/tcg-discord-bot](https://github.com/TCG-Price-Lookup/tcg-discord-bot).",
        },
      )
      .setFooter({
        text: "TCG Price Lookup · tcgpricelookup.com/tcg-api",
      });

    await interaction.reply({ embeds: [embed] });
  },
};
