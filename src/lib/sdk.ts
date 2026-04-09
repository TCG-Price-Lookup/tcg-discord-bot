/**
 * Single shared TCG Price Lookup client instance.
 *
 * Reusing one client across the bot lifetime keeps the rate-limit
 * counter coherent and reuses the underlying HTTP keep-alive pool.
 */

import { TcgLookupClient } from "@tcgpricelookup/sdk";
import { env } from "./env.js";

export const tcg = new TcgLookupClient({
  apiKey: env.TCGLOOKUP_API_KEY,
  userAgent: "tcg-discord-bot/0.1.0",
});

/**
 * Game slugs accepted by the API. Keep this in sync with the
 * `game` choice list in `commands/price.ts`.
 */
export const GAME_SLUGS = [
  "pokemon",
  "pokemon-jp",
  "mtg",
  "yugioh",
  "lorcana",
  "onepiece",
  "swu",
  "fab",
] as const;

export type GameSlug = (typeof GAME_SLUGS)[number];

export const GAME_LABELS: Record<GameSlug, string> = {
  pokemon: "Pokémon",
  "pokemon-jp": "Pokémon Japan",
  mtg: "Magic: The Gathering",
  yugioh: "Yu-Gi-Oh!",
  lorcana: "Disney Lorcana",
  onepiece: "One Piece",
  swu: "Star Wars: Unlimited",
  fab: "Flesh and Blood",
};
