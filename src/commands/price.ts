/**
 * /price — search trading card prices by name.
 *
 * Three interaction patterns are wired up here:
 *
 *   1. Slash command (`execute`): runs the search, renders either a
 *      single-card detail embed or a paginated results list.
 *   2. Autocomplete (`autocomplete`): suggests card names as the user
 *      types, respecting the optional game filter.
 *   3. Button click (`handleButton`): re-runs the search at a different
 *      page offset when the user clicks Prev / Next.
 */

import { SlashCommandBuilder } from "discord.js";
import type { BotCommand } from "./index.js";
import { tcg, GAME_LABELS, type GameSlug } from "../lib/sdk.js";
import { cardEmbed, searchResultsEmbed } from "../lib/format.js";
import { describeError } from "../lib/errors.js";
import { getServerConfig } from "../lib/serverConfig.js";
import {
  PAGE_SIZE,
  pageWindow,
  paginationRow,
  parseButtonId,
  totalPages as totalPagesOf,
} from "../lib/pagination.js";

/** Shape of the state we round-trip through pagination buttons. */
interface PriceButtonState extends Record<string, unknown> {
  q: string;
  game?: string;
}

/** Shared search → embed → buttons render path used by both /price and the buttons. */
async function renderPage(
  query: string,
  game: GameSlug | undefined,
  page: number,
) {
  // We always fetch with `total` known so we can compute total pages.
  // The first call uses offset 0; subsequent button clicks compute the
  // correct offset from `pageWindow`.
  const probe = await tcg.cards.search({ q: query, game, limit: PAGE_SIZE, offset: 0 });
  const total = probe.total;
  const tp = totalPagesOf(total);
  const safePage = Math.min(Math.max(1, page), tp);

  // If the requested page isn't page 1, do a second call with the
  // proper offset. Page 1 reuses the probe so we don't double-fetch.
  let pageData = probe.data;
  if (safePage !== 1) {
    const window = pageWindow(safePage, total);
    const refetch = await tcg.cards.search({
      q: query,
      game,
      limit: window.limit,
      offset: window.offset,
    });
    pageData = refetch.data;
  }

  const embed = searchResultsEmbed(query, pageData, total, game, safePage, tp);
  const state: PriceButtonState = { q: query };
  if (game) state.game = game;
  const row = paginationRow("price", safePage, tp, state);

  return { embed, row, total, pageData };
}

export const priceCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("price")
    .setDescription("Look up live trading card prices across every major TCG")
    .addStringOption((opt) =>
      opt
        .setName("card")
        .setDescription("Card name (e.g. 'charizard', 'black lotus')")
        .setRequired(true)
        .setMaxLength(100)
        .setAutocomplete(true),
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
    let game = (interaction.options.getString("game") ?? undefined) as
      | GameSlug
      | undefined;

    // If the user didn't pick a game and the server has a default
    // configured, fall back to that. This is what makes /config
    // default-game actually do something useful — single-game servers
    // can omit the filter on every call and still get scoped results.
    if (!game && interaction.guildId) {
      const config = getServerConfig(interaction.guildId);
      if (config.default_game) {
        game = config.default_game;
      }
    }

    // Defer immediately — the API call usually takes 200-800ms which
    // is longer than Discord's 3-second initial-response window allows
    // when the bot is under any load.
    await interaction.deferReply();

    try {
      const { embed, row, total, pageData } = await renderPage(query, game, 1);

      // Exact match → render the detail embed for the top hit instead
      // of a 1-row list. Skip pagination buttons in that case.
      if (total === 1 && pageData.length === 1) {
        await interaction.editReply({ embeds: [cardEmbed(pageData[0]!)] });
        return;
      }

      await interaction.editReply({
        embeds: [embed],
        components: row ? [row] : [],
      });
    } catch (err) {
      await interaction.editReply({ content: describeError(err) });
    }
  },

  /**
   * Autocomplete handler — fires on every keystroke for the `card` option.
   *
   * We must respond within ~3 seconds and we cannot defer. The user's
   * partial input arrives in `getFocused().value`; if it's empty we
   * return no suggestions to avoid burning quota on stub queries.
   */
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

    // Honour the game filter if the user has already picked one — this
    // makes the suggestions much more relevant in single-game servers.
    // Falls back to the server's default game if /config set one.
    let game = (interaction.options.getString("game") ?? undefined) as
      | GameSlug
      | undefined;
    if (!game && interaction.guildId) {
      const config = getServerConfig(interaction.guildId);
      if (config.default_game) {
        game = config.default_game;
      }
    }

    try {
      const results = await tcg.cards.search({ q: query, game, limit: 10 });
      const choices = results.data.map((card) => {
        const setShort = card.set.name.length > 30
          ? card.set.name.slice(0, 27) + "..."
          : card.set.name;
        const gameLabel = GAME_LABELS[card.game.slug as GameSlug] ?? card.game.name;
        // Discord caps choice `name` at 100 chars and `value` at 100 chars.
        // We send the card UUID as the value so the slash command resolver
        // gets a stable identifier — `execute` re-searches by name anyway,
        // but a UUID round-trip is robust to typos and re-runs.
        const name = `${card.name} — ${setShort} (${gameLabel})`.slice(0, 100);
        return { name, value: card.name.slice(0, 100) };
      });
      await interaction.respond(choices);
    } catch {
      await interaction.respond([]);
    }
  },

  /**
   * Button click handler — fired when the user clicks Prev / Next on
   * a previous /price result. The button's customId carries the page
   * number and the original query so we can re-fetch and re-render.
   */
  async handleButton(interaction) {
    const parsed = parseButtonId<PriceButtonState>(interaction.customId);
    if (!parsed || !parsed.state.q) {
      await interaction.update({
        content: "This button has expired. Run `/price` again.",
        embeds: [],
        components: [],
      });
      return;
    }

    // Defer the update so the page-fetch round trip doesn't time out.
    await interaction.deferUpdate();

    try {
      const { embed, row } = await renderPage(
        parsed.state.q,
        parsed.state.game as GameSlug | undefined,
        parsed.page,
      );
      await interaction.editReply({
        embeds: [embed],
        components: row ? [row] : [],
      });
    } catch (err) {
      await interaction.editReply({
        content: describeError(err),
        embeds: [],
        components: [],
      });
    }
  },
};
