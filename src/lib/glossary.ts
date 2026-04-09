/**
 * Static glossary of trading card game terminology.
 *
 * This is a curated dictionary of terms collectors and players run
 * into across the major TCGs. The data is hard-coded so the command
 * is instant (no API call) and works offline. Add new entries by
 * extending the GLOSSARY map below.
 *
 * Search is intentionally fuzzy: we match on the canonical term, on
 * any aliases, and on substring of either, so the user doesn't have
 * to know the exact canonical phrasing.
 */

export interface GlossaryEntry {
  /** Canonical name of the term, used as the embed title. */
  term: string;
  /** Alternate spellings / abbreviations the user might type. */
  aliases: string[];
  /** Plain-language definition. Markdown is OK. */
  definition: string;
  /** Optional category for grouping. */
  category:
    | "grading"
    | "rarity"
    | "condition"
    | "format"
    | "market"
    | "product"
    | "general";
  /** Which games this term is most relevant to ("all" for cross-game). */
  games?: Array<"pokemon" | "mtg" | "yugioh" | "lorcana" | "onepiece" | "swu" | "fab" | "all">;
}

export const GLOSSARY: GlossaryEntry[] = [
  // Grading
  {
    term: "PSA",
    aliases: ["psa", "professional sports authenticator"],
    definition:
      "**Professional Sports Authenticator** — the largest third-party grading service for trading cards. Grades cards on a 1-10 scale, with **PSA 10 (Gem Mint)** commanding the biggest market premium. PSA dominates the modern Pokémon market and is widely accepted across MTG and Yu-Gi-Oh!.",
    category: "grading",
    games: ["all"],
  },
  {
    term: "BGS",
    aliases: ["bgs", "beckett", "beckett grading services"],
    definition:
      "**Beckett Grading Services** — premium third-party grading service. Uses a 1-10 scale with **half-grades** (e.g. BGS 9.5) and four sub-grades (centering, corners, edges, surface). **BGS 10 Pristine** is the rarest grade in the hobby and commands extreme premiums on chase cards.",
    category: "grading",
    games: ["all"],
  },
  {
    term: "CGC",
    aliases: ["cgc", "certified guaranty company"],
    definition:
      "**Certified Guaranty Company** — third-party grading service known for fast turnaround and transparent population reports. CGC has grown rapidly in the TCG market and is now a major alternative to PSA and BGS for both vintage and modern cards.",
    category: "grading",
    games: ["all"],
  },
  {
    term: "Gem Mint",
    aliases: ["gem mint", "psa 10", "gm"],
    definition:
      "**Gem Mint** is the highest grade most services issue (PSA 10, BGS 9.5, CGC 10). A Gem Mint card has perfectly sharp corners, no surface scratches, no whitening, and centering that meets the strictest threshold the grader uses. The price gap between a 9 and a 10 is often **5-20×**, which is why grading is a bet rather than a sure thing.",
    category: "grading",
    games: ["all"],
  },
  {
    term: "Pop Report",
    aliases: ["pop report", "population report", "pop"],
    definition:
      "**Population report** — public data published by grading services showing how many cards exist at each grade. A card with a low PSA 10 pop is rarer in that grade and usually trades at a higher premium. Pop counts can grow rapidly when a card becomes popular to grade.",
    category: "grading",
    games: ["all"],
  },

  // Rarity
  {
    term: "1st Edition",
    aliases: ["1st edition", "first edition", "1ed"],
    definition:
      "Cards from the first print run of a set, marked with a **'1st Edition' stamp** (in the bottom-left corner on Pokémon and Yu-Gi-Oh!). 1st Edition copies are dramatically rarer than the unlimited reprints that follow and command large premiums — especially for vintage sets like Base Set Pokémon and Legend of Blue Eyes Yu-Gi-Oh!.",
    category: "rarity",
    games: ["pokemon", "yugioh"],
  },
  {
    term: "Holo",
    aliases: ["holo", "holographic", "holofoil"],
    definition:
      "**Holographic foil** — the shiny treatment applied to the artwork (or sometimes the whole card) to make it stand out from non-foil prints. The first Pokémon holos used a 'shadowless' frame style which is itself a chase variant.",
    category: "rarity",
    games: ["all"],
  },
  {
    term: "Reverse Holo",
    aliases: ["reverse holo", "reverse foil", "rh"],
    definition:
      "**Reverse holographic** — a variant where the **non-art portion** of the card has the foil treatment instead of the art. Common in Pokémon and MTG; usually carries a small premium over the non-foil version of the same card.",
    category: "rarity",
    games: ["pokemon", "mtg"],
  },
  {
    term: "Enchanted",
    aliases: ["enchanted", "enchanted rare"],
    definition:
      "**Enchanted Rare** — Disney Lorcana's chase rarity tier. Full-art alternate version of a normal-rarity card with rainbow foil treatment. Pull rate is roughly 1 per case (~144 packs). Enchanted rares from First Chapter routinely trade for $300-$1,500 raw.",
    category: "rarity",
    games: ["lorcana"],
  },
  {
    term: "Showcase",
    aliases: ["showcase", "showcase rare"],
    definition:
      "**Showcase** — Star Wars: Unlimited's full-art chase rarity. Alternate-art treatment with the illustration extending across the entire card frame. Pulled at roughly 1 per 2-3 booster boxes. The most-valuable retail-pullable tier in SWU.",
    category: "rarity",
    games: ["swu"],
  },
  {
    term: "Hyperspace",
    aliases: ["hyperspace", "hyperspace foil"],
    definition:
      "**Hyperspace Foil** — Star Wars: Unlimited's mid-tier chase. Alternate art with a hyperspace-streak background and distinctive foil. Pulled roughly 1 per box.",
    category: "rarity",
    games: ["swu"],
  },
  {
    term: "Cold Foil",
    aliases: ["cold foil", "cf"],
    definition:
      "**Cold Foil** — Flesh and Blood's premium foil treatment. LSS has committed to **never reprinting Cold Foils**, which makes them the structural top of the FaB secondary market. Cold Foil Legendaries from early sets routinely trade above $1,000.",
    category: "rarity",
    games: ["fab"],
  },
  {
    term: "Manga Rare",
    aliases: ["manga rare", "mr"],
    definition:
      "**Manga Rare** — One Piece TCG's chase rarity featuring black-and-white manga-style art. The OP-01 manga rares (Luffy, Zoro) are the iconic chase cards of the One Piece secondary market.",
    category: "rarity",
    games: ["onepiece"],
  },
  {
    term: "Secret Rare",
    aliases: ["secret rare", "scr"],
    definition:
      "**Secret Rare** — Yu-Gi-Oh!'s color-shift foil rarity above Ultra Rare. The rainbow shimmer changes as you tilt the card. Secret Rares from pre-2008 sets trade in the hundreds-to-thousands range; modern Secret Rares of meta-relevant cards spike with tournament results.",
    category: "rarity",
    games: ["yugioh"],
  },
  {
    term: "Quarter Century Secret Rare",
    aliases: ["qcsr", "quarter century secret rare", "quarter century"],
    definition:
      "**Quarter Century Secret Rare** — Yu-Gi-Oh!'s 25th-anniversary rarity tier introduced in 2023. Distinctive cool-tone foil treatment. Pulled at ~1 per case. Top-end QCSRs have crossed $2,000.",
    category: "rarity",
    games: ["yugioh"],
  },
  {
    term: "Reserved List",
    aliases: ["reserved list", "rl"],
    definition:
      "**Reserved List** — Magic: The Gathering's official list of cards that Wizards of the Coast has promised never to reprint in functionally identical form. The Reserved List is the foundation of MTG's vintage market — Black Lotus, Power Nine, dual lands all trade at premiums anchored by this no-reprint guarantee.",
    category: "rarity",
    games: ["mtg"],
  },

  // Condition
  {
    term: "Near Mint",
    aliases: ["near mint", "nm"],
    definition:
      "**Near Mint (NM)** — pack-fresh or nearly so. No visible corner wear, no whitening on the back, no scratches under bright light. NM is the **reference price** in every TCG marketplace; every other condition tier discounts from here.",
    category: "condition",
    games: ["all"],
  },
  {
    term: "Lightly Played",
    aliases: ["lightly played", "lp"],
    definition:
      "**Lightly Played (LP)** — visibly used but still presentable. Minor edge wear, very slight corner rounding, maybe a faint scratch. Typically trades at **80-90% of NM** for most cards.",
    category: "condition",
    games: ["all"],
  },
  {
    term: "Moderately Played",
    aliases: ["moderately played", "mp"],
    definition:
      "**Moderately Played (MP)** — clear corner whitening, obvious edge wear, multiple light surface scratches. The card is still fully usable in a deck. Typically trades at **60-70% of NM**.",
    category: "condition",
    games: ["all"],
  },
  {
    term: "Heavily Played",
    aliases: ["heavily played", "hp"],
    definition:
      "**Heavily Played (HP)** — significant corner and edge whitening, surface scratches, sometimes minor warping. Still recognisable but not display-grade. Typically trades at **40-50% of NM**.",
    category: "condition",
    games: ["all"],
  },
  {
    term: "Damaged",
    aliases: ["damaged", "dmg"],
    definition:
      "**Damaged (DMG)** — any creasing, ink, water damage, tearing, or major structural issue. Even a single small crease drops a card to Damaged regardless of how clean the rest of it is. Typically trades at **20-30% of NM**, though true vintage chase cards can hold much more.",
    category: "condition",
    games: ["all"],
  },

  // Market
  {
    term: "Market Price",
    aliases: ["market price", "market", "tcg market"],
    definition:
      "**Market price** is TCGPlayer's **rolling average of recent sold listings** for a card in NM condition. It's the most widely-used reference point in the TCG market and what most price trackers (including TCG Price Lookup) display by default.",
    category: "market",
    games: ["all"],
  },
  {
    term: "Bulk",
    aliases: ["bulk", "bulk rares", "bulk commons"],
    definition:
      "**Bulk** — cards with no meaningful individual value, usually traded by the pound or per-thousand. Bulk commons typically sell for **$2-5 per 1,000 cards**. Bulk rares for **$3-5 per 100**. Don't waste time pricing bulk individually — sort it and sell it together.",
    category: "market",
    games: ["all"],
  },
  {
    term: "Sealed",
    aliases: ["sealed", "sealed product", "booster box"],
    definition:
      "**Sealed product** — booster boxes, ETBs, collection boxes, theme decks that have never been opened. Sealed product is its own market segment, often appreciating faster than singles for sets where chase cards are concentrated.",
    category: "product",
    games: ["all"],
  },
  {
    term: "ETB",
    aliases: ["etb", "elite trainer box"],
    definition:
      "**Elite Trainer Box (ETB)** — a Pokémon TCG product containing 8-10 booster packs plus accessories (sleeves, dice, damage counters, energy cards). ETBs from popular sets are themselves collectible and often appreciate faster than the booster boxes for the same set.",
    category: "product",
    games: ["pokemon"],
  },
  {
    term: "Booster Box",
    aliases: ["booster box", "bb"],
    definition:
      "**Booster box** — sealed case containing typically 24-36 booster packs from a single set. The standard sealed product unit for case breakers and long-term sealed collectors.",
    category: "product",
    games: ["all"],
  },

  // Format
  {
    term: "Standard",
    aliases: ["standard", "standard format"],
    definition:
      "**Standard** — the rotating competitive format that uses only cards from the most recent sets (typically the last 18-24 months). Standard cards lose value the moment they rotate out, while collectors' cards from those same sets keep their value.",
    category: "format",
    games: ["mtg", "pokemon"],
  },
  {
    term: "Modern",
    aliases: ["modern", "modern format"],
    definition:
      "**Modern** — Magic: The Gathering's non-rotating format using cards from 2003 onwards. Modern staples are some of MTG's most consistently valuable cards because they have permanent demand from a large player base.",
    category: "format",
    games: ["mtg"],
  },
  {
    term: "Commander",
    aliases: ["commander", "edh"],
    definition:
      "**Commander / EDH** — Magic: The Gathering's most popular casual format. 100-card singleton decks led by a legendary creature. Commander demand drives a huge slice of MTG singles pricing — 'commander staples' are some of the safest long-term holds in the game.",
    category: "format",
    games: ["mtg"],
  },

  // General
  {
    term: "Foil",
    aliases: ["foil"],
    definition:
      "**Foil** — any card with a holographic / shimmer treatment. Foils typically command a premium over non-foil prints of the same card, ranging from a small bump (Lorcana foils, ~25-75%) to multiples (Pokémon holo rares, MTG modern foils, FaB Cold Foils — 2-20×).",
    category: "general",
    games: ["all"],
  },
  {
    term: "Misprint",
    aliases: ["misprint", "error card"],
    definition:
      "**Misprint** — a card with a documented manufacturing error (off-center cut, ink smear, color registration issue, missing layer, wrong-orientation back). Authenticated misprints command large premiums from a niche but real collector base.",
    category: "general",
    games: ["all"],
  },
  {
    term: "Slab",
    aliases: ["slab", "slabbed"],
    definition:
      "**Slab** — slang for a card encased in a third-party grading holder (PSA, BGS, CGC). 'Slabbed' = graded. The slab itself is part of the value because it certifies authenticity and condition.",
    category: "grading",
    games: ["all"],
  },
];

/** Find the best matching glossary entry for a query string. */
export function findGlossaryEntry(query: string): GlossaryEntry | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;

  // Pass 1: exact match on term or alias.
  for (const entry of GLOSSARY) {
    if (entry.term.toLowerCase() === q) return entry;
    if (entry.aliases.includes(q)) return entry;
  }
  // Pass 2: substring match on term or alias.
  for (const entry of GLOSSARY) {
    if (entry.term.toLowerCase().includes(q)) return entry;
    if (entry.aliases.some((a) => a.includes(q))) return entry;
  }
  // Pass 3: substring of definition (last resort, slow but exhaustive).
  for (const entry of GLOSSARY) {
    if (entry.definition.toLowerCase().includes(q)) return entry;
  }
  return null;
}

/** Top-N suggestions for autocomplete. */
export function suggestGlossaryTerms(query: string, limit = 10): GlossaryEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return GLOSSARY.slice(0, limit);
  const matches = GLOSSARY.filter(
    (entry) =>
      entry.term.toLowerCase().includes(q) ||
      entry.aliases.some((a) => a.includes(q)),
  );
  return matches.slice(0, limit);
}
