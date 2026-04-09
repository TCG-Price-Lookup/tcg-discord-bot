/**
 * /compare — side-by-side prices for two cards.
 *
 * Both inputs accept autocomplete the same way /price does, so the
 * user gets the resolved card name back from Discord. We then run two
 * parallel searches and pick the top hit for each, building a single
 * embed with two field columns.
 *
 * Useful for "which printing should I sell?" decisions and naturally
 * shareable in trading-focused channels.
 */

import { EmbedBuilder, SlashCommandBuilder } from "discord.js";
import type { Card } from "@tcgpricelookup/sdk";
import type { BotCommand } from "./index.js";
import { tcg, GAME_LABELS, type GameSlug } from "../lib/sdk.js";
import { describeError } from "../lib/errors.js";

const EMBED_COLOR = 0x9333ea;

function fmtMoney(value: number | null | undefined): string {
  if (value == null) return "—";
  return `$${value.toFixed(2)}`;
}

/** Pull headline data points out of a card for the compare embed. */
function summarise(card: Card): string {
  const lines: string[] = [];
  const setLine = card.number
    ? `${card.set.name} #${card.number}`
    : card.set.name;
  lines.push(`**Set:** ${setLine}`);
  lines.push(
    `**Game:** ${GAME_LABELS[card.game.slug as GameSlug] ?? card.game.name}`,
  );
  if (card.rarity) lines.push(`**Rarity:** ${card.rarity}`);

  const nm = card.prices?.raw?.near_mint;
  const market = nm?.tcgplayer?.market;
  const ebay = nm?.ebay?.avg_30d;
  lines.push(`**NM TCGPlayer:** ${fmtMoney(market)}`);
  if (ebay != null) lines.push(`**NM eBay 30d:** ${fmtMoney(ebay)}`);

  // Best graded comp if any are present.
  const graded = card.prices?.graded;
  if (graded) {
    for (const [grader, grades] of Object.entries(graded)) {
      if (!grades) continue;
      const sorted = Object.keys(grades).sort((a, b) => Number(b) - Number(a));
      const top = sorted[0];
      if (!top) continue;
      const sources = grades[top];
      const value = sources?.ebay?.avg_30d;
      if (value != null) {
        lines.push(`**${grader.toUpperCase()} ${top}:** ${fmtMoney(value)}`);
        break; // Just the highest graded service to keep the field tight.
      }
    }
  }

  return lines.join("\n");
}

/** Compute "winner" delta between two NM TCGPlayer market prices. */
function deltaSummary(a: Card, b: Card): string | null {
  const av = a.prices?.raw?.near_mint?.tcgplayer?.market;
  const bv = b.prices?.raw?.near_mint?.tcgplayer?.market;
  if (av == null || bv == null) return null;
  if (av === bv) return "Both cards have the same NM TCGPlayer market price.";
  const higher = av > bv ? a : b;
  const lower = av > bv ? b : a;
  const hv = av > bv ? av : bv;
  const lv = av > bv ? bv : av;
  const pct = ((hv - lv) / lv) * 100;
  return `**${higher.name}** is **${pct.toFixed(1)}%** more valuable than **${lower.name}** in NM.`;
}

/** Resolve a user-supplied card name to the top search match, or null. */
async function resolveCard(query: string): Promise<Card | null> {
  const results = await tcg.cards.search({ q: query, limit: 1 });
  return results.data[0] ?? null;
}

export const compareCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("compare")
    .setDescription("Side-by-side price comparison for two cards")
    .addStringOption((opt) =>
      opt
        .setName("card1")
        .setDescription("First card name")
        .setRequired(true)
        .setMaxLength(100)
        .setAutocomplete(true),
    )
    .addStringOption((opt) =>
      opt
        .setName("card2")
        .setDescription("Second card name")
        .setRequired(true)
        .setMaxLength(100)
        .setAutocomplete(true),
    ),

  async execute(interaction) {
    const q1 = interaction.options.getString("card1", true);
    const q2 = interaction.options.getString("card2", true);

    await interaction.deferReply();

    try {
      // Run both lookups in parallel — saves ~1 RTT vs sequential.
      const [card1, card2] = await Promise.all([
        resolveCard(q1),
        resolveCard(q2),
      ]);

      if (!card1 || !card2) {
        const missing = !card1 ? q1 : q2;
        await interaction.editReply({
          content: `❓ Couldn't find a match for **${missing}**. Try a more specific name.`,
        });
        return;
      }

      const embed = new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setTitle(`Compare: ${card1.name} vs ${card2.name}`)
        .setURL("https://tcgpricelookup.com/catalog")
        .addFields(
          { name: card1.name, value: summarise(card1), inline: true },
          { name: card2.name, value: summarise(card2), inline: true },
        )
        .setFooter({ text: "TCG Price Lookup · tcgpricelookup.com" });

      const delta = deltaSummary(card1, card2);
      if (delta) {
        embed.addFields({ name: "Verdict", value: delta });
      }

      // Use the first card's image as the thumbnail. The second card's
      // image stays accessible via its URL on tcgpricelookup.com (the
      // embed title is linked).
      if (card1.image_url) embed.setThumbnail(card1.image_url);

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      await interaction.editReply({ content: describeError(err) });
    }
  },

  /** Same autocomplete strategy as /price — top 10 matches by name. */
  async autocomplete(interaction) {
    const focused = interaction.options.getFocused(true);
    if (focused.name !== "card1" && focused.name !== "card2") {
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
