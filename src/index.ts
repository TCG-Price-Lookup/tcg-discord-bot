/**
 * Bot entry point.
 *
 * Logs in to Discord, listens for slash command interactions, and
 * dispatches to the registered commands. Errors inside command handlers
 * are caught here as a backstop so a single bad command can never crash
 * the whole process.
 */

import { Client, Events, GatewayIntentBits } from "discord.js";
import { env } from "./lib/env.js";
import { commandMap } from "./commands/index.js";

// We only need the Guilds intent — slash commands fire as interaction
// events which don't require message content or member intents.
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, (ready) => {
  console.log(`✅ Logged in as ${ready.user.tag}`);
  console.log(
    `   Serving ${ready.guilds.cache.size} guild${ready.guilds.cache.size === 1 ? "" : "s"}`,
  );
  console.log(`   ${commandMap.size} commands registered`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = commandMap.get(interaction.commandName);
  if (!command) {
    await interaction.reply({
      content: `Unknown command: ${interaction.commandName}`,
      ephemeral: true,
    });
    return;
  }

  try {
    await command.execute(interaction);
  } catch (err) {
    console.error(`Error in /${interaction.commandName}:`, err);
    const message =
      "⚠️ Something went wrong handling that command. Try again in a moment.";
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content: message }).catch(() => {});
    } else {
      await interaction.reply({ content: message, ephemeral: true }).catch(() => {});
    }
  }
});

// Handle SIGINT/SIGTERM cleanly so containers shut down without leaking
// the websocket connection back to Discord.
function shutdown(signal: string) {
  console.log(`Received ${signal}, shutting down...`);
  client.destroy().finally(() => process.exit(0));
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

await client.login(env.DISCORD_TOKEN);
