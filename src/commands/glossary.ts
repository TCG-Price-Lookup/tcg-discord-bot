/**
 * /glossary — TCG terminology dictionary.
 *
 * Static dictionary of trading card game terms and abbreviations,
 * shipped as part of the bot binary so the lookup is instant. The
 * autocomplete suggests matching entries as the user types so they
 * can browse the dictionary by scrolling.
 *
 * Curated list lives in lib/glossary.ts — extending it is just an
 * append to the GLOSSARY array.
 */

import { EmbedBuilder, SlashCommandBuilder } from "discord.js";
import type { BotCommand } from "./index.js";
import { findGlossaryEntry, suggestGlossaryTerms } from "../lib/glossary.js";

const EMBED_COLOR = 0x9333ea;

const CATEGORY_LABELS: Record<string, string> = {
  grading: "🎓 Grading",
  rarity: "✨ Rarity",
  condition: "🔍 Condition",
  format: "🎲 Format",
  market: "💰 Market",
  product: "📦 Product",
  general: "📚 General",
};

export const glossaryCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("glossary")
    .setDescription("Look up TCG terms and abbreviations (PSA, NM, ETB, Enchanted, etc.)")
    .addStringOption((opt) =>
      opt
        .setName("term")
        .setDescription("Term, abbreviation, or short phrase")
        .setRequired(true)
        .setMaxLength(100)
        .setAutocomplete(true),
    ),

  async execute(interaction) {
    const query = interaction.options.getString("term", true);
    const entry = findGlossaryEntry(query);

    if (!entry) {
      await interaction.reply({
        content:
          `❓ No glossary entry for **${query}**. Try a common abbreviation like \`PSA\`, \`NM\`, \`ETB\`, or \`Enchanted\`.`,
        ephemeral: true,
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(EMBED_COLOR)
      .setTitle(entry.term)
      .setDescription(entry.definition)
      .setFooter({
        text: `${CATEGORY_LABELS[entry.category] ?? entry.category} · TCG Price Lookup`,
      });

    if (entry.aliases.length > 0) {
      embed.addFields({
        name: "Also known as",
        value: entry.aliases.map((a) => `\`${a}\``).join(", "),
      });
    }

    if (entry.games && !entry.games.includes("all")) {
      const gameLabels: Record<string, string> = {
        pokemon: "Pokémon",
        mtg: "Magic: The Gathering",
        yugioh: "Yu-Gi-Oh!",
        lorcana: "Disney Lorcana",
        onepiece: "One Piece",
        swu: "Star Wars: Unlimited",
        fab: "Flesh and Blood",
      };
      embed.addFields({
        name: "Most relevant to",
        value: entry.games.map((g) => gameLabels[g] ?? g).join(", "),
      });
    }

    await interaction.reply({ embeds: [embed] });
  },

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused();
    const matches = suggestGlossaryTerms(focused);
    await interaction.respond(
      matches.map((entry) => ({
        name: `${entry.term} (${entry.category})`.slice(0, 100),
        value: entry.term.slice(0, 100),
      })),
    );
  },
};
