/**
 * Bot entry point.
 *
 * Logs in to Discord and dispatches three kinds of interactions to
 * the appropriate command handler:
 *
 *   1. Slash commands (`isChatInputCommand`) → `command.execute`
 *   2. Autocomplete events (`isAutocomplete`)  → `command.autocomplete`
 *   3. Button clicks (`isButton`)              → `command.handleButton`
 *      Routed by the `<commandName>:` prefix on the button's customId.
 *
 * Errors inside command handlers are caught here as a backstop so a
 * single bad command can never crash the whole process.
 */

import { Client, Events, GatewayIntentBits } from "discord.js";
import { env } from "./lib/env.js";
import { commandMap } from "./commands/index.js";
import { startScheduler } from "./lib/scheduler.js";
import { closeDb } from "./lib/db.js";

// Importing workers for their side effect: each worker file calls
// `registerJob` at module load time, which the scheduler picks up
// when `startScheduler` runs in the ClientReady handler below.
import "./workers/alertsWorker.js";
import "./workers/setsWorker.js";
import "./workers/dailyReportWorker.js";

// We only need the Guilds intent — slash commands fire as interaction
// events which don't require message content or member intents.
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, (ready) => {
  console.log(`✅ Logged in as ${ready.user.tag}`);
  console.log(
    `   Serving ${ready.guilds.cache.size} guild${ready.guilds.cache.size === 1 ? "" : "s"}`,
  );
  console.log(`   ${commandMap.size} commands registered`);

  // Boot the cron-driven workers (alerts polling, set release watcher,
  // daily report). They're registered via lib/scheduler at module load
  // and start firing on their declared schedules from this point on.
  startScheduler(ready);
});

client.on(Events.InteractionCreate, async (interaction) => {
  // Slash command invocation.
  if (interaction.isChatInputCommand()) {
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
    return;
  }

  // Autocomplete suggestion request — fired on every keystroke for
  // options that opt in via `setAutocomplete(true)`. We must respond
  // within ~3 seconds and we cannot defer.
  if (interaction.isAutocomplete()) {
    const command = commandMap.get(interaction.commandName);
    if (!command?.autocomplete) {
      await interaction.respond([]).catch(() => {});
      return;
    }
    try {
      await command.autocomplete(interaction);
    } catch (err) {
      console.error(`Autocomplete error in /${interaction.commandName}:`, err);
      // Empty array is the safe fallback — Discord just shows no
      // suggestions rather than throwing in the user's face.
      await interaction.respond([]).catch(() => {});
    }
    return;
  }

  // Button click on a paginated embed (or any other component).
  // Routing is by the prefix before the first colon in customId,
  // which we always set to the owning command name.
  if (interaction.isButton()) {
    const [commandName] = interaction.customId.split(":");
    if (!commandName) return;
    const command = commandMap.get(commandName);
    if (!command?.handleButton) {
      // Disabled indicator buttons (e.g. "1 / 5") use a `:noop` id and
      // intentionally have no handler — silently ignore them.
      if (!interaction.customId.endsWith(":noop")) {
        await interaction
          .reply({ content: "This button has expired.", ephemeral: true })
          .catch(() => {});
      }
      return;
    }
    try {
      await command.handleButton(interaction);
    } catch (err) {
      console.error(`Button error in /${commandName}:`, err);
      const message = "⚠️ Something went wrong with that button.";
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content: message }).catch(() => {});
      } else {
        await interaction.reply({ content: message, ephemeral: true }).catch(() => {});
      }
    }
  }
});

// Handle SIGINT/SIGTERM cleanly so containers shut down without leaking
// the websocket connection back to Discord.
function shutdown(signal: string) {
  console.log(`Received ${signal}, shutting down...`);
  client.destroy().finally(() => {
    closeDb();
    process.exit(0);
  });
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

await client.login(env.DISCORD_TOKEN);
