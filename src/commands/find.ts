/**
 * /find — cross-game search.
 *
 * Where /price filters to a single game, /find runs the same query
 * across every supported TCG in parallel and returns the best match
 * per game in a single embed. Useful for cross-IP cards (Pikachu in
 * Pokemon, Lorcana, etc.) and for collectors who don't yet know which
 * game a card belongs to.
 */

import { EmbedBuilder, SlashCommandBuilder } from "discord.js";
import type { Card } from "@tcgpricelookup/sdk";
import type { BotCommand } from "./index.js";
import { tcg, GAME_LABELS, GAME_SLUGS, type GameSlug } from "../lib/sdk.js";
import { describeError } from "../lib/errors.js";

const EMBED_COLOR = 0x9333ea;

function fmtMoney(value: number | null | undefined): string {
  if (value == null) return "—";
  return `$${value.toFixed(2)}`;
}

/** Format the per-game field body for the embed. */
function fieldValue(card: Card | null): string {
  if (!card) return "_no match_";
  const setLine = card.number ? `${card.set.name} #${card.number}` : card.set.name;
  const market = card.prices?.raw?.near_mint?.tcgplayer?.market;
  return `[${card.name}](https://tcgpricelookup.com/card/${card.id})\n${setLine}\nNM: **${fmtMoney(market)}**`;
}

export const findCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("find")
    .setDescription("Find a card across every game in one shot (cross-game search)")
    .addStringOption((opt) =>
      opt
        .setName("card")
        .setDescription("Card name to search across every TCG")
        .setRequired(true)
        .setMaxLength(100)
        .setAutocomplete(true),
    ),

  async execute(interaction) {
    const query = interaction.options.getString("card", true);
    await interaction.deferReply();

    try {
      // Fan out: one search per supported game, all in flight at once.
      // This is 8 parallel HTTP calls — well within sensible quota use
      // for an explicit user-initiated command, and the round-trip is
      // bounded by the slowest single API call (~800ms).
      const settled = await Promise.allSettled(
        GAME_SLUGS.map((game) =>
          tcg.cards
            .search({ q: query, game, limit: 1 })
            .then((res) => ({ game, card: res.data[0] ?? null })),
        ),
      );

      // Collect successful results in their original game order.
      const hits: Array<{ game: GameSlug; card: Card | null }> = [];
      for (const result of settled) {
        if (result.status === "fulfilled") {
          hits.push(result.value);
        }
      }

      const matchCount = hits.filter((h) => h.card !== null).length;
      if (matchCount === 0) {
        await interaction.editReply({
          content: `❓ No matches for **${query}** in any supported game.`,
        });
        return;
      }

      const embed = new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setTitle(`Cross-game search: ${query}`)
        .setURL("https://tcgpricelookup.com/catalog")
        .setDescription(
          `Found in **${matchCount}** of ${GAME_SLUGS.length} games.`,
        )
        .setFooter({ text: "TCG Price Lookup · tcgpricelookup.com" });

      // One inline field per game so Discord renders them as a grid.
      // We include "no match" entries so the user can see at a glance
      // which games are confirmed empty vs which weren't checked.
      for (const { game, card } of hits) {
        embed.addFields({
          name: GAME_LABELS[game],
          value: fieldValue(card),
          inline: true,
        });
      }

      // Use the first hit's image as the thumbnail for visual anchor.
      const firstWithImage = hits.find((h) => h.card?.image_url)?.card;
      if (firstWithImage?.image_url) {
        embed.setThumbnail(firstWithImage.image_url);
      }

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      await interaction.editReply({ content: describeError(err) });
    }
  },

  /** Same autocomplete pattern as /price, no game filter. */
  async autocomplete(interaction) {
    const focused = interaction.options.getFocused(true);
    if (focused.name !== "card") {
      await interaction.respond([]);
      return;
    }
    const query = focused.value.trim();
    if (query.length < 2) {
      await interaction.respond([]);
      return;
    }
    try {
      const results = await tcg.cards.search({ q: query, limit: 10 });
      const choices = results.data.map((card) => {
        const setShort = card.set.name.length > 30
          ? card.set.name.slice(0, 27) + "..."
          : card.set.name;
        const gameLabel = GAME_LABELS[card.game.slug as GameSlug] ?? card.game.name;
        const name = `${card.name} — ${setShort} (${gameLabel})`.slice(0, 100);
        return { name, value: card.name.slice(0, 100) };
      });
      await interaction.respond(choices);
    } catch {
      await interaction.respond([]);
    }
  },
};
