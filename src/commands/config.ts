/**
 * /config — per-server administrator settings.
 *
 * All subcommands require the `ManageGuild` permission so random
 * users can't mess with server-wide defaults. Discord enforces this
 * via `setDefaultMemberPermissions` on the command itself, but we
 * also re-check at runtime as a defense-in-depth measure.
 *
 * Subcommands:
 *   /config show
 *   /config default-game <game>
 *   /config clear-default-game
 *   /config locale <locale>
 *   /config daily-report channel:<channel> enabled:<bool>
 *   /config notify-set-releases channel:<channel>
 */

import {
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import type { BotCommand } from "./index.js";
import { GAME_LABELS } from "../lib/sdk.js";
import {
  getServerConfig,
  isGameSlug,
  isSupportedLocale,
  updateServerConfig,
} from "../lib/serverConfig.js";

const EMBED_COLOR = 0x9333ea;

export const configCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("config")
    .setDescription("Server-wide bot configuration (admins only)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild.toString())
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub.setName("show").setDescription("Show this server's current bot config"),
    )
    .addSubcommand((sub) =>
      sub
        .setName("default-game")
        .setDescription("Set the default game for /price calls without an explicit game filter")
        .addStringOption((opt) =>
          opt
            .setName("game")
            .setDescription("Game slug")
            .setRequired(true)
            .addChoices(
              ...Object.entries(GAME_LABELS).map(([value, name]) => ({
                name,
                value,
              })),
            ),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("clear-default-game")
        .setDescription("Remove the default game filter so /price searches all games again"),
    )
    .addSubcommand((sub) =>
      sub
        .setName("locale")
        .setDescription("Set the bot's response language for this server")
        .addStringOption((opt) =>
          opt
            .setName("locale")
            .setDescription("Locale code")
            .setRequired(true)
            .addChoices(
              { name: "English", value: "en" },
              { name: "Polski", value: "pl" },
              { name: "Français", value: "fr" },
              { name: "Deutsch", value: "de" },
              { name: "Español", value: "es" },
              { name: "Italiano", value: "it" },
              { name: "日本語", value: "ja" },
              { name: "Nederlands", value: "nl" },
              { name: "Português (BR)", value: "pt-BR" },
            ),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("daily-report")
        .setDescription("Configure the daily market report channel")
        .addChannelOption((opt) =>
          opt
            .setName("channel")
            .setDescription("Channel where the daily report should post (or omit to disable)")
            .setRequired(false)
            .addChannelTypes(ChannelType.GuildText),
        )
        .addBooleanOption((opt) =>
          opt
            .setName("enabled")
            .setDescription("Turn the daily report on or off")
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("notify-set-releases")
        .setDescription("Pick a channel to be notified when new sets are added to the API")
        .addChannelOption((opt) =>
          opt
            .setName("channel")
            .setDescription("Channel for set release notifications (or omit to disable)")
            .setRequired(false)
            .addChannelTypes(ChannelType.GuildText),
        ),
    ),

  async execute(interaction) {
    if (!interaction.guildId) {
      await interaction.reply({
        content: "/config only works inside a server.",
        ephemeral: true,
      });
      return;
    }

    // Defense-in-depth: re-check perms at runtime even though Discord
    // already filters via setDefaultMemberPermissions. Server owners
    // can override default perms per-channel and we don't want a
    // misconfigured override to grant config access.
    if (
      !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)
    ) {
      await interaction.reply({
        content: "❌ You need the **Manage Server** permission to use /config.",
        ephemeral: true,
      });
      return;
    }

    const sub = interaction.options.getSubcommand();

    if (sub === "show") {
      await handleShow(interaction);
      return;
    }

    if (sub === "default-game") {
      const game = interaction.options.getString("game", true);
      if (!isGameSlug(game)) {
        await interaction.reply({ content: `Unknown game: ${game}`, ephemeral: true });
        return;
      }
      updateServerConfig(interaction.guildId, { default_game: game });
      await interaction.reply({
        content: `✅ Default game set to **${GAME_LABELS[game]}**. \`/price\` calls without a \`game\` option will use this filter.`,
        ephemeral: true,
      });
      return;
    }

    if (sub === "clear-default-game") {
      updateServerConfig(interaction.guildId, { default_game: null });
      await interaction.reply({
        content: "✅ Cleared default game. `/price` will now search all games again.",
        ephemeral: true,
      });
      return;
    }

    if (sub === "locale") {
      const locale = interaction.options.getString("locale", true);
      if (!isSupportedLocale(locale)) {
        await interaction.reply({ content: `Unknown locale: ${locale}`, ephemeral: true });
        return;
      }
      updateServerConfig(interaction.guildId, { locale });
      await interaction.reply({
        content: `✅ Locale set to **${locale}**.`,
        ephemeral: true,
      });
      return;
    }

    if (sub === "daily-report") {
      const channel = interaction.options.getChannel("channel");
      const enabled = interaction.options.getBoolean("enabled");
      const patch: Parameters<typeof updateServerConfig>[1] = {};
      if (channel) patch.daily_report_channel_id = channel.id;
      if (enabled !== null) patch.daily_report_enabled = enabled;
      // If neither was provided, treat as "disable + clear channel".
      if (!channel && enabled === null) {
        patch.daily_report_channel_id = null;
        patch.daily_report_enabled = false;
      }
      const updated = updateServerConfig(interaction.guildId, patch);
      const status = updated.daily_report_enabled ? "enabled" : "disabled";
      const channelStr = updated.daily_report_channel_id
        ? `<#${updated.daily_report_channel_id}>`
        : "_no channel_";
      await interaction.reply({
        content: `✅ Daily report **${status}** in ${channelStr}.`,
        ephemeral: true,
      });
      return;
    }

    if (sub === "notify-set-releases") {
      const channel = interaction.options.getChannel("channel");
      const updated = updateServerConfig(interaction.guildId, {
        set_release_channel_id: channel?.id ?? null,
      });
      const channelStr = updated.set_release_channel_id
        ? `<#${updated.set_release_channel_id}>`
        : "_no channel_";
      await interaction.reply({
        content: `✅ Set release notifications now post in ${channelStr}.`,
        ephemeral: true,
      });
      return;
    }
  },
};

async function handleShow(
  interaction: Parameters<NonNullable<BotCommand["execute"]>>[0],
): Promise<void> {
  const config = getServerConfig(interaction.guildId!);

  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setTitle("Server bot config")
    .addFields(
      {
        name: "Default game",
        value: config.default_game
          ? `**${GAME_LABELS[config.default_game]}** (\`${config.default_game}\`)`
          : "_unset_ — `/price` searches all games",
        inline: false,
      },
      {
        name: "Locale",
        value: config.locale,
        inline: true,
      },
      {
        name: "Daily report",
        value: config.daily_report_enabled
          ? `enabled in <#${config.daily_report_channel_id ?? "?"}>`
          : "disabled",
        inline: true,
      },
      {
        name: "Set release notifications",
        value: config.set_release_channel_id
          ? `<#${config.set_release_channel_id}>`
          : "_unset_",
        inline: true,
      },
    )
    .setFooter({ text: "TCG Price Lookup · /config to change" });

  await interaction.reply({ embeds: [embed], ephemeral: true });
}
