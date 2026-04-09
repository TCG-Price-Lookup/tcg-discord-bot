/**
 * Tiny i18n helper.
 *
 * Translation files live in `src/i18n/<locale>.json`. They are flat
 * nested objects of strings with `{placeholder}` interpolation. The
 * lookup function takes a dotted key path (e.g. `alert.added`) plus
 * an optional params object and returns the rendered string.
 *
 * Locale resolution priority for runtime calls:
 *
 *   1. Explicit `locale` argument passed by the caller
 *   2. The guild's `server_config.locale` (if guildId is provided)
 *   3. The user's Discord client locale
 *   4. English as the final fallback
 *
 * Missing keys / missing locales fall through to English without
 * crashing — better to show an English string than a tracebak in
 * the user's chat.
 */

import en from "../i18n/en.json" with { type: "json" };
import pl from "../i18n/pl.json" with { type: "json" };
import { getServerConfig } from "./serverConfig.js";

type Translations = typeof en;

const LOCALES: Record<string, Translations> = {
  en,
  pl: pl as Translations,
};

const DEFAULT_LOCALE = "en";

/** Pick the best matching locale for a given guild + user fallback. */
export function resolveLocale(opts: {
  explicit?: string;
  guildId?: string | null;
  userLocale?: string | null;
}): string {
  const tryLocale = (l: string | null | undefined): string | null => {
    if (!l) return null;
    if (LOCALES[l]) return l;
    // Discord sends locales like "pl-PL" — strip region.
    const base = l.split("-")[0];
    if (base && LOCALES[base]) return base;
    return null;
  };

  return (
    tryLocale(opts.explicit) ??
    tryLocale(
      opts.guildId ? getServerConfig(opts.guildId).locale : null,
    ) ??
    tryLocale(opts.userLocale) ??
    DEFAULT_LOCALE
  );
}

/**
 * Look up a translation by dotted key path.
 *
 * @example
 *   t("alert.added", { id: 5, card: "Charizard", target: "your DMs", direction: "rises above", threshold: "100.00" })
 */
export function t(
  key: string,
  params: Record<string, string | number> = {},
  locale: string = DEFAULT_LOCALE,
): string {
  const bundle = LOCALES[locale] ?? LOCALES[DEFAULT_LOCALE]!;
  const value = lookup(bundle, key) ?? lookup(LOCALES[DEFAULT_LOCALE]!, key);
  if (typeof value !== "string") return key;
  return interpolate(value, params);
}

function lookup(obj: unknown, dottedKey: string): unknown {
  let cursor: unknown = obj;
  for (const part of dottedKey.split(".")) {
    if (cursor == null || typeof cursor !== "object") return undefined;
    cursor = (cursor as Record<string, unknown>)[part];
  }
  return cursor;
}

function interpolate(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, name: string) => {
    const value = params[name];
    return value == null ? `{${name}}` : String(value);
  });
}
