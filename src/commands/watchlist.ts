/**
 * /watchlist — lightweight card tracker.
 *
 * Different from /alert: no threshold, no notifications, just a
 * persistent bookmark of cards the user wants to keep an eye on.
 * /watchlist show batch-refreshes prices for everything in the list.
 *
 * Subcommands:
 *   /watchlist add card:<name> [note]
 *   /watchlist show
 *   /watchlist remove card:<name>
 */

import { EmbedBuilder, SlashCommandBuilder } from "discord.js";
import type { BotCommand } from "./index.js";
import { tcg, GAME_LABELS, type GameSlug } from "../lib/sdk.js";
import { describeError } from "../lib/errors.js";
import {
  addToWatchlist,
  findWatchlistRowByName,
  listWatchlist,
  removeFromWatchlist,
} from "../lib/watchlistRepo.js";

const EMBED_COLOR = 0x9333ea;

function fmtMoney(value: number | null | undefined): string {
  if (value == null) return "—";
  return `$${value.toFixed(2)}`;
}

export const watchlistCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("watchlist")
    .setDescription("Bookmark cards to track without setting a price threshold")
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName("add")
        .setDescription("Add a card to your watchlist")
        .addStringOption((opt) =>
          opt
            .setName("card")
            .setDescription("Card name")
            .setRequired(true)
            .setMaxLength(100)
            .setAutocomplete(true),
        )
        .addStringOption((opt) =>
          opt
            .setName("note")
            .setDescription("Optional reminder note (e.g. 'birthday gift idea')")
            .setRequired(false)
            .setMaxLength(200),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("show")
        .setDescription("Show your watchlist with current prices"),
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("Remove a card from your watchlist")
        .addStringOption((opt) =>
          opt
            .setName("card")
            .setDescription("Card name (autocompleted from your watchlist)")
            .setRequired(true)
            .setMaxLength(100)
            .setAutocomplete(true),
        ),
    ),

  async execute(interaction) {
    if (!interaction.guildId) {
      await interaction.reply({
        content: "/watchlist only works inside a server.",
        ephemeral: true,
      });
      return;
    }

    const sub = interaction.options.getSubcommand();
    if (sub === "add") return handleAdd(interaction);
    if (sub === "show") return handleShow(interaction);
    if (sub === "remove") return handleRemove(interaction);
  },

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused(true);
    if (focused.name !== "card") {
      await interaction.respond([]);
      return;
    }
    const query = focused.value.trim();
    const sub = interaction.options.getSubcommand();

    // /watchlist remove suggests only entries the user actually has.
    if (sub === "remove" && interaction.guildId) {
      const owned = listWatchlist(interaction.user.id, interaction.guildId);
      const matches = owned
        .filter((row) =>
          row.card_name.toLowerCase().includes(query.toLowerCase()),
        )
        .slice(0, 10)
        .map((row) => ({
          name: row.card_name.slice(0, 100),
          value: row.card_name.slice(0, 100),
        }));
      await interaction.respond(matches);
      return;
    }

    // /watchlist add — search the whole catalogue.
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

async function handleAdd(
  interaction: Parameters<NonNullable<BotCommand["execute"]>>[0],
): Promise<void> {
  const cardName = interaction.options.getString("card", true);
  const note = interaction.options.getString("note");

  await interaction.deferReply({ ephemeral: true });

  try {
    const search = await tcg.cards.search({ q: cardName, limit: 1 });
    const card = search.data[0];
    if (!card) {
      await interaction.editReply({ content: `❓ No card found for **${cardName}**.` });
      return;
    }

    addToWatchlist({
      userId: interaction.user.id,
      guildId: interaction.guildId!,
      cardId: card.id,
      cardName: card.name,
      note: note ?? null,
    });

    await interaction.editReply({
      content: `👁️ Added **${card.name}** to your watchlist.${note ? `\nNote: _${note}_` : ""}`,
    });
  } catch (err) {
    await interaction.editReply({ content: describeError(err) });
  }
}

async function handleShow(
  interaction: Parameters<NonNullable<BotCommand["execute"]>>[0],
): Promise<void> {
  const rows = listWatchlist(interaction.user.id, interaction.guildId!);
  if (rows.length === 0) {
    await interaction.reply({
      content:
        "Your watchlist is empty. Bookmark cards with `/watchlist add card:<name>`.",
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    // Batch-refresh prices for everything in the list. The SDK auto-
    // chunks at 20 IDs so a 100-card watchlist is just 5 round trips.
    const ids = rows.map((r) => r.card_id);
    const fresh = await tcg.cards.search({ ids, limit: ids.length });
    const priceById = new Map(
      fresh.data.map((c) => [
        c.id,
        c.prices?.raw?.near_mint?.tcgplayer?.market ?? null,
      ]),
    );

    const lines = rows.map((row, i) => {
      const price = priceById.get(row.card_id);
      const noteSuffix = row.note ? ` _(${row.note})_` : "";
      return `**${i + 1}.** [${row.card_name}](https://tcgpricelookup.com/card/${row.card_id}) — **${fmtMoney(price)}**${noteSuffix}`;
    });

    const embed = new EmbedBuilder()
      .setColor(EMBED_COLOR)
      .setTitle(`👁️ ${interaction.user.username}'s watchlist`)
      .setDescription(lines.slice(0, 20).join("\n"))
      .setFooter({
        text:
          rows.length > 20
            ? `Showing 20 of ${rows.length} watched cards`
            : `${rows.length} watched card${rows.length === 1 ? "" : "s"}`,
      });

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    await interaction.editReply({ content: describeError(err) });
  }
}

async function handleRemove(
  interaction: Parameters<NonNullable<BotCommand["execute"]>>[0],
): Promise<void> {
  const cardName = interaction.options.getString("card", true);
  const row = findWatchlistRowByName(
    interaction.user.id,
    interaction.guildId!,
    cardName,
  );
  if (!row) {
    await interaction.reply({
      content: `❓ **${cardName}** isn't on your watchlist.`,
      ephemeral: true,
    });
    return;
  }
  removeFromWatchlist(interaction.user.id, interaction.guildId!, row.card_id);
  await interaction.reply({
    content: `✅ Removed **${row.card_name}** from your watchlist.`,
    ephemeral: true,
  });
}
