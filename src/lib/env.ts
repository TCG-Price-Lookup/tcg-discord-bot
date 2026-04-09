/**
 * Centralised environment variable parsing.
 *
 * We fail loudly at startup if any required variable is missing —
 * better to crash on boot than to silently 401 on the first command.
 */

import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}\n\nSee README.md for setup instructions.`,
    );
  }
  return value;
}

export const env = {
  /** Discord bot token from https://discord.com/developers/applications */
  DISCORD_TOKEN: required("DISCORD_TOKEN"),
  /** Discord application ID (same page as the token) */
  DISCORD_CLIENT_ID: required("DISCORD_CLIENT_ID"),
  /**
   * Optional guild ID for fast command sync during development.
   * Leave empty in production to register globally (takes ~1h to propagate).
   */
  DISCORD_GUILD_ID: process.env.DISCORD_GUILD_ID ?? "",
  /** TCG Price Lookup API key from https://tcgpricelookup.com/tcg-api */
  TCGLOOKUP_API_KEY: required("TCGLOOKUP_API_KEY"),
};
