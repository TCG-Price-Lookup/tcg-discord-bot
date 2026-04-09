/**
 * /alert — per-user price alerts.
 *
 * Subcommands:
 *
 *   /alert add card:<name> price:<usd> direction:[above|below] [channel]
 *   /alert list
 *   /alert remove id:<n>
 *   /alert pause id:<n>
 *   /alert resume id:<n>
 *
 * Alerts are scoped per (user, guild). The optional `channel` option
 * makes the alert post to a channel instead of the user's DMs — useful
 * for shared finance channels.
 *
 * The actual polling happens in workers/alertsWorker.ts on a cron
 * schedule. This command is just CRUD over the alerts table.
 */

import {
  ChannelType,
  EmbedBuilder,
  SlashCommandBuilder,
} from "discord.js";
import type { BotCommand } from "./index.js";
import { tcg, GAME_LABELS, type GameSlug } from "../lib/sdk.js";
import { describeError } from "../lib/errors.js";
import {
  createAlert,
  deleteAlert,
  listAlertsForUser,
  setAlertPaused,
  type AlertDirection,
} from "../lib/alertRepo.js";

const EMBED_COLOR = 0x9333ea;

export const alertCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("alert")
    .setDescription("Get notified when a card crosses a price threshold")
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName("add")
        .setDescription("Watch a card and notify when it hits a price")
        .addStringOption((opt) =>
          opt
            .setName("card")
            .setDescription("Card name")
            .setRequired(true)
            .setMaxLength(100)
            .setAutocomplete(true),
        )
        .addNumberOption((opt) =>
          opt
            .setName("price")
            .setDescription("Threshold price in USD")
            .setRequired(true)
            .setMinValue(0.01)
            .setMaxValue(1_000_000),
        )
        .addStringOption((opt) =>
          opt
            .setName("direction")
            .setDescription("Trigger when price goes above or below the threshold")
            .setRequired(true)
            .addChoices(
              { name: "Above (alert me when it rises)", value: "above" },
              { name: "Below (alert me when it drops)", value: "below" },
            ),
        )
        .addChannelOption((opt) =>
          opt
            .setName("channel")
            .setDescription("Post to a channel instead of DM (optional)")
            .setRequired(false)
            .addChannelTypes(ChannelType.GuildText),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName("list").setDescription("Show your active alerts in this server"),
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("Delete one of your alerts")
        .addIntegerOption((opt) =>
          opt
            .setName("id")
            .setDescription("Alert ID from /alert list")
            .setRequired(true)
            .setMinValue(1),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("pause")
        .setDescription("Temporarily stop checking an alert")
        .addIntegerOption((opt) =>
          opt
            .setName("id")
            .setDescription("Alert ID from /alert list")
            .setRequired(true)
            .setMinValue(1),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("resume")
        .setDescription("Re-enable a paused alert")
        .addIntegerOption((opt) =>
          opt
            .setName("id")
            .setDescription("Alert ID from /alert list")
            .setRequired(true)
            .setMinValue(1),
        ),
    ),

  async execute(interaction) {
    if (!interaction.guildId) {
      await interaction.reply({
        content: "/alert only works inside a server.",
        ephemeral: true,
      });
      return;
    }

    const sub = interaction.options.getSubcommand();

    if (sub === "add") return handleAdd(interaction);
    if (sub === "list") return handleList(interaction);
    if (sub === "remove") return handleRemove(interaction);
    if (sub === "pause") return handlePause(interaction, true);
    if (sub === "resume") return handlePause(interaction, false);
  },

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

// ============================================================ subcommands

async function handleAdd(
  interaction: Parameters<NonNullable<BotCommand["execute"]>>[0],
): Promise<void> {
  const cardName = interaction.options.getString("card", true);
  const price = interaction.options.getNumber("price", true);
  const direction = interaction.options.getString("direction", true) as AlertDirection;
  const channel = interaction.options.getChannel("channel");

  await interaction.deferReply({ ephemeral: true });

  try {
    const search = await tcg.cards.search({ q: cardName, limit: 1 });
    const card = search.data[0];
    if (!card) {
      await interaction.editReply({ content: `❓ No card found for **${cardName}**.` });
      return;
    }

    const id = createAlert({
      userId: interaction.user.id,
      guildId: interaction.guildId!,
      channelId: channel?.id ?? null,
      cardId: card.id,
      cardName: card.name,
      threshold: price,
      direction,
    });

    const target = channel ? `<#${channel.id}>` : "your DMs";
    const dirWord = direction === "above" ? "rises above" : "drops below";
    await interaction.editReply({
      content:
        `✅ Alert **#${id}** created.\n` +
        `I'll notify ${target} when **${card.name}** ${dirWord} **$${price.toFixed(2)}**.\n` +
        `_Polling runs every hour. Manage with \`/alert list\`._`,
    });
  } catch (err) {
    await interaction.editReply({ content: describeError(err) });
  }
}

async function handleList(
  interaction: Parameters<NonNullable<BotCommand["execute"]>>[0],
): Promise<void> {
  const alerts = listAlertsForUser(interaction.user.id, interaction.guildId!);
  if (alerts.length === 0) {
    await interaction.reply({
      content: "You have no alerts in this server. Add one with `/alert add`.",
      ephemeral: true,
    });
    return;
  }

  const lines = alerts.map((a) => {
    const dirSymbol = a.direction === "above" ? "↑" : "↓";
    const target = a.channel_id ? `<#${a.channel_id}>` : "DM";
    const status = a.paused ? " ⏸️ paused" : "";
    return `**#${a.id}** ${dirSymbol} ${a.card_name} @ **$${a.threshold.toFixed(2)}** → ${target}${status}`;
  });

  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setTitle(`Your alerts (${alerts.length})`)
    .setDescription(lines.join("\n"))
    .setFooter({
      text: "Manage with /alert remove id:<n> or /alert pause id:<n>",
    });

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleRemove(
  interaction: Parameters<NonNullable<BotCommand["execute"]>>[0],
): Promise<void> {
  const id = interaction.options.getInteger("id", true);
  const removed = deleteAlert(id, interaction.user.id);
  if (!removed) {
    await interaction.reply({
      content: `❓ Couldn't find alert #${id} (or it isn't yours).`,
      ephemeral: true,
    });
    return;
  }
  await interaction.reply({ content: `✅ Alert #${id} removed.`, ephemeral: true });
}

async function handlePause(
  interaction: Parameters<NonNullable<BotCommand["execute"]>>[0],
  paused: boolean,
): Promise<void> {
  const id = interaction.options.getInteger("id", true);
  const ok = setAlertPaused(id, interaction.user.id, paused);
  if (!ok) {
    await interaction.reply({
      content: `❓ Couldn't find alert #${id} (or it isn't yours).`,
      ephemeral: true,
    });
    return;
  }
  const word = paused ? "paused" : "resumed";
  await interaction.reply({ content: `✅ Alert #${id} ${word}.`, ephemeral: true });
}
