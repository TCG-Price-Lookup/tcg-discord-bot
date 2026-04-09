/**
 * Map TCG Price Lookup SDK errors to user-friendly Discord replies.
 */

import {
  AuthenticationError,
  NotFoundError,
  PlanAccessError,
  RateLimitError,
  TcgLookupError,
} from "@tcgpricelookup/sdk";

export function describeError(err: unknown): string {
  if (err instanceof AuthenticationError) {
    return "❌ The bot's API key is invalid. Ask the bot operator to check `TCGLOOKUP_API_KEY`.";
  }
  if (err instanceof PlanAccessError) {
    return "🔒 This data requires the **Trader** plan or above. Upgrade at <https://tcgpricelookup.com/tcg-api>.";
  }
  if (err instanceof NotFoundError) {
    return "❓ Card not found. Try a different search term or check spelling.";
  }
  if (err instanceof RateLimitError) {
    return "⏳ Rate limit exceeded. Try again in a minute, or upgrade the bot's plan at <https://tcgpricelookup.com/tcg-api>.";
  }
  if (err instanceof TcgLookupError) {
    return `⚠️ TCG Price Lookup API error: ${err.message}`;
  }
  return "⚠️ Something went wrong fetching card data. Try again in a moment.";
}
