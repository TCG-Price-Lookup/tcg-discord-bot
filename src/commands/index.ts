/**
 * Command registry. Each command exports a `data` (slash command builder)
 * and an `execute` (interaction handler).
 *
 * Adding a new command means importing it here and pushing it to the
 * `commands` array — `deploy-commands.ts` and `index.ts` both read from
 * this single source of truth.
 *
 * Commands MAY also export:
 *   - `autocomplete(interaction)` — handles autocomplete events for the
 *     command's slash options. Implement this when a string option needs
 *     suggestions as the user types.
 *   - `handleButton(interaction)` — handles button click events for any
 *     buttons whose `customId` starts with `"<commandName>:"`. The bot's
 *     central button dispatcher routes by that prefix.
 */

import type {
  AutocompleteInteraction,
  ButtonInteraction,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  SlashCommandOptionsOnlyBuilder,
  SlashCommandSubcommandsOnlyBuilder,
} from "discord.js";

import { priceCommand } from "./price.js";
import { cardCommand } from "./card.js";
import { gamesCommand } from "./games.js";
import { helpCommand } from "./help.js";
import { randomCommand } from "./random.js";
import { compareCommand } from "./compare.js";

export interface BotCommand {
  data:
    | SlashCommandBuilder
    | SlashCommandOptionsOnlyBuilder
    | SlashCommandSubcommandsOnlyBuilder;
  execute(interaction: ChatInputCommandInteraction): Promise<void>;
  autocomplete?(interaction: AutocompleteInteraction): Promise<void>;
  handleButton?(interaction: ButtonInteraction): Promise<void>;
}

export const commands: BotCommand[] = [
  priceCommand,
  cardCommand,
  gamesCommand,
  randomCommand,
  compareCommand,
  helpCommand,
];

/** Lookup map by command name for fast dispatch in the interaction handler. */
export const commandMap = new Map<string, BotCommand>(
  commands.map((c) => [c.data.name, c]),
);
