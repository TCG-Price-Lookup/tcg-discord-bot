/**
 * /set — browse cards in a specific set with pagination.
 *
 * The user picks a set by slug (autocomplete suggests matches via
 * the sets endpoint), optionally narrows by game, then we list cards
 * in that set with the same Prev / Next button pagination as /price.
 *
 * Pairs naturally with set collectors who chase complete sets and
 * want to see the highest-price chase cards in one place.
 */

import { SlashCommandBuilder } from "discord.js";
import type { BotCommand } from "./index.js";
import { tcg, GAME_LABELS, type GameSlug } from "../lib/sdk.js";
import { searchResultsEmbed } from "../lib/format.js";
import { describeError } from "../lib/errors.js";
import {
  PAGE_SIZE,
  pageWindow,
  paginationRow,
  parseButtonId,
  totalPages as totalPagesOf,
} from "../lib/pagination.js";

interface SetButtonState extends Record<string, unknown> {
  set: string;
  game?: string;
}

/** Shared render — used by both /set and the pagination buttons. */
async function renderSetPage(
  setSlug: string,
  game: GameSlug | undefined,
  page: number,
) {
  const probe = await tcg.cards.search({
    set: setSlug,
    game,
    limit: PAGE_SIZE,
    offset: 0,
  });
  const total = probe.total;
  const tp = totalPagesOf(total);
  const safePage = Math.min(Math.max(1, page), tp);

  let pageData = probe.data;
  if (safePage !== 1) {
    const window = pageWindow(safePage, total);
    const refetch = await tcg.cards.search({
      set: setSlug,
      game,
      limit: window.limit,
      offset: window.offset,
    });
    pageData = refetch.data;
  }

  // Re-use the searchResultsEmbed renderer with a synthetic "query"
  // that names the set rather than a search term, so the embed reads
  // naturally as "Cards in <set>".
  const embed = searchResultsEmbed(
    `Cards in ${setSlug}`,
    pageData,
    total,
    game,
    safePage,
    tp,
  );

  const state: SetButtonState = { set: setSlug };
  if (game) state.game = game;
  const row = paginationRow("set", safePage, tp, state);
  return { embed, row };
}

export const setCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("set")
    .setDescription("Browse cards in a specific set")
    .addStringOption((opt) =>
      opt
        .setName("set")
        .setDescription("Set name or slug (e.g. 'base set', 'spark of rebellion')")
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
    const setSlug = interaction.options.getString("set", true);
    const game = (interaction.options.getString("game") ?? undefined) as
      | GameSlug
      | undefined;

    await interaction.deferReply();

    try {
      const { embed, row } = await renderSetPage(setSlug, game, 1);
      await interaction.editReply({
        embeds: [embed],
        components: row ? [row] : [],
      });
    } catch (err) {
      await interaction.editReply({ content: describeError(err) });
    }
  },

  /**
   * Autocomplete on the `set` option queries the sets endpoint.
   *
   * The API doesn't support a free-text search on /sets, so we list
   * all sets (paginated) and filter client-side. Caching the full set
   * list in memory would be a clean optimisation; for v0.2 we trade a
   * tiny bit of latency for code simplicity by re-fetching each time.
   */
  async autocomplete(interaction) {
    const focused = interaction.options.getFocused(true);
    if (focused.name !== "set") {
      await interaction.respond([]);
      return;
    }
    const query = focused.value.trim().toLowerCase();
    if (query.length < 2) {
      await interaction.respond([]);
      return;
    }
    const game = (interaction.options.getString("game") ?? undefined) as
      | GameSlug
      | undefined;

    try {
      // Fetch a generous slice of sets and filter locally — the API
      // caps page size at 200, which is enough for 9 of 10 servers.
      // Single-game filter narrows the set count meaningfully.
      const res = await tcg.sets.list({ game, limit: 200 });
      const filtered = res.data
        .filter(
          (s) =>
            s.name.toLowerCase().includes(query) ||
            s.slug.toLowerCase().includes(query),
        )
        .slice(0, 10)
        .map((s) => {
          const gameLabel = GAME_LABELS[s.game as GameSlug] ?? s.game;
          const name = `${s.name} — ${gameLabel} (${s.count} cards)`.slice(0, 100);
          return { name, value: s.slug.slice(0, 100) };
        });
      await interaction.respond(filtered);
    } catch {
      await interaction.respond([]);
    }
  },

  async handleButton(interaction) {
    const parsed = parseButtonId<SetButtonState>(interaction.customId);
    if (!parsed || !parsed.state.set) {
      await interaction.update({
        content: "This button has expired. Run `/set` again.",
        embeds: [],
        components: [],
      });
      return;
    }

    await interaction.deferUpdate();

    try {
      const { embed, row } = await renderSetPage(
        parsed.state.set,
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
