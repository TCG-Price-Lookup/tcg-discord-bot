/**
 * One-shot script to register slash commands with Discord.
 *
 * Discord requires every slash command to be registered ahead of time
 * via their REST API. Run this whenever you add or modify a command.
 *
 * Usage:
 *   pnpm run deploy-commands         # global registration (~1h propagation)
 *   DISCORD_GUILD_ID=... pnpm run deploy-commands   # instant, scoped to one guild
 *
 * In development you almost always want guild-scoped registration so
 * you don't have to wait an hour to see your changes.
 */

import { REST, Routes } from "discord.js";
import { env } from "./lib/env.js";
import { commands } from "./commands/index.js";

const body = commands.map((c) => c.data.toJSON());
const rest = new REST().setToken(env.DISCORD_TOKEN);

async function main() {
  console.log(`Registering ${body.length} command(s) with Discord...`);
  try {
    if (env.DISCORD_GUILD_ID) {
      await rest.put(
        Routes.applicationGuildCommands(env.DISCORD_CLIENT_ID, env.DISCORD_GUILD_ID),
        { body },
      );
      console.log(
        `✅ Registered ${body.length} guild-scoped command(s). They are available immediately.`,
      );
    } else {
      await rest.put(Routes.applicationCommands(env.DISCORD_CLIENT_ID), {
        body,
      });
      console.log(
        `✅ Registered ${body.length} global command(s). May take up to an hour to propagate to every server.`,
      );
    }
  } catch (err) {
    console.error("Failed to register commands:", err);
    process.exit(1);
  }
}

main();
