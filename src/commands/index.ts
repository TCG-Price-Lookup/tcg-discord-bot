/**
 * Command registry. Each command exports a `data` (slash command builder)
 * and an `execute` (interaction handler).
 *
 * Adding a new command means importing it here and pushing it to the
 * `commands` array — `deploy-commands.ts` and `index.ts` both read from
 * this single source of truth.
 */

import type {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  SlashCommandOptionsOnlyBuilder,
} from "discord.js";

import { priceCommand } from "./price.js";
import { cardCommand } from "./card.js";
import { gamesCommand } from "./games.js";
import { helpCommand } from "./help.js";

export interface BotCommand {
  data: SlashCommandBuilder | SlashCommandOptionsOnlyBuilder;
  execute(interaction: ChatInputCommandInteraction): Promise<void>;
}

export const commands: BotCommand[] = [
  priceCommand,
  cardCommand,
  gamesCommand,
  helpCommand,
];

/** Lookup map by command name for fast dispatch in the interaction handler. */
export const commandMap = new Map<string, BotCommand>(
  commands.map((c) => [c.data.name, c]),
);
