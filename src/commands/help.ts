/**
 * /help — bot usage and credits.
 *
 * Lists every command in the bot grouped by what it's good for.
 * Updated whenever a new command lands so the embed stays the
 * single source of truth users can read.
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
          name: "🔎 Lookup",
          value:
            "**/price** `<card> [game]` — search by name with autocomplete + pagination\n" +
            "**/card** `<id>` — full price block for a card UUID\n" +
            "**/find** `<card>` — same name across all 8 games at once\n" +
            "**/compare** `<a> <b>` — side-by-side price comparison\n" +
            "**/random** `[game]` — random featured card\n" +
            "**/set** `<set>` — browse cards in a specific set\n" +
            "**/sets-recent** `[game]` — most recently released sets\n" +
            "**/glossary** `<term>` — TCG terminology dictionary",
        },
        {
          name: "📈 History (Trader plan)",
          value:
            "**/history** `<card> [period]` — line chart over 7d / 30d / 90d / 1y\n" +
            "**/grading-calc** `<card>` — should you send it for grading? PSA/BGS/CGC math",
        },
        {
          name: "🔔 Alerts & 👁️ Watchlist",
          value:
            "**/alert add** — watch a card and get notified when it crosses a price\n" +
            "**/alert list / remove / pause / resume** — manage active alerts\n" +
            "**/watchlist add / show / remove** — bookmark cards without thresholds",
        },
        {
          name: "📦 Portfolio",
          value:
            "**/portfolio add** — track a card with optional qty + purchase price\n" +
            "**/portfolio show** — live valuations + P&L for your holdings\n" +
            "**/portfolio import** — bulk add from a paste\n" +
            "**/portfolio export** — JSON or CSV download\n" +
            "**/portfolio remove** — drop a card",
        },
        {
          name: "🃏 Tools",
          value:
            "**/deckcost** `<deck>` — paste a decklist, get the total cost\n" +
            "**/trade** `<offer> <for>` — trade fairness evaluator",
        },
        {
          name: "🏆 Server-wide",
          value:
            "**/leaderboard portfolios** — top portfolio holders by current value\n" +
            "**/leaderboard cards** — most-watched cards in this server\n" +
            "**/games** — every supported TCG with catalog size",
        },
        {
          name: "⚙️ Admin (Manage Server)",
          value:
            "**/config show** — see this server's config\n" +
            "**/config default-game** — set a default game for /price\n" +
            "**/config locale** — bot response language (en, pl, …)\n" +
            "**/config daily-report** — pick a channel for the daily market report\n" +
            "**/config notify-set-releases** — auto-post when new sets are added",
        },
        {
          name: "Free vs Trader",
          value:
            "The Free plan returns TCGPlayer market prices. The **Trader** plan unlocks eBay sold averages, PSA / BGS / CGC graded prices, and 1-year history (`/history` chart). The bot operator controls the plan.\n[Compare plans →](https://tcgpricelookup.com/pricing)",
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
