# tcg-discord-bot

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Node.js 18+](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](https://nodejs.org/)
[![Powered by TCG Price Lookup](https://img.shields.io/badge/powered%20by-TCG%20Price%20Lookup-purple.svg)](https://tcgpricelookup.com/tcg-api)

A self-hosted Discord bot that brings live trading card prices into your server with slash commands. **Pokémon, Magic: The Gathering, Yu-Gi-Oh!, Disney Lorcana, One Piece TCG, Star Wars: Unlimited,** and **Flesh and Blood** — one bot, every game.

Powered by the [**TCG Price Lookup API**](https://tcgpricelookup.com/tcg-api). Built on `discord.js` v14 + the official [`@tcgpricelookup/sdk`](https://www.npmjs.com/package/@tcgpricelookup/sdk) — easy to fork, easy to deploy.

```
/price card:charizard game:Pokémon
```

> **Charizard** *Base Set · Pokémon · #4 · Holo Rare*
>
> **Raw prices**
> **Near Mint** — TCGPlayer: $488.20 · eBay 30d: $462.10
> **Lightly Played** — TCGPlayer: $390.56 · eBay 30d: $402.50
> ...
>
> **Graded prices**
> **PSA 10** — $9,500.00 (eBay 30d)
> **BGS 9.5** — $4,250.00 (eBay 30d)

## Slash commands

### 🔎 Lookup

| Command | What it does |
|---|---|
| `/price <card> [game]` | Search by name with **autocomplete** as you type and **Prev / Next pagination buttons** on the result list. Optionally filter to one game (or set a server-wide default with `/config`). |
| `/card <id>` | Fetch a single card by its UUID for the full price block: every condition, eBay sold averages, PSA / BGS / CGC graded comps. |
| `/find <card>` | Cross-game search — runs the same query in parallel against all 8 supported games and returns the best match per game in one embed. |
| `/compare <card1> <card2>` | Side-by-side price comparison with a "verdict" field showing the percentage delta. |
| `/random [game]` | Pull a random card from the catalogue. Optional game filter. |
| `/set <set>` | Browse cards in a specific set with autocomplete on the set name and pagination on the results. |

### 📈 History (Trader plan)

| Command | What it does |
|---|---|
| `/history <card> [period]` | Render a daily price history chart (7d / 30d / 90d / 1y) as an embed image. Footer shows the percentage change over the period. Requires the Trader plan or above. |

### 🔔 Alerts

| Command | What it does |
|---|---|
| `/alert add card:<name> price:<usd> direction:[above\|below] [channel]` | Watch a card and get notified when it crosses a threshold. The optional `channel` posts to a server channel instead of your DMs — useful for shared finance channels. |
| `/alert list` | Show all your active alerts in this server. |
| `/alert remove id:<n>` | Delete an alert by its ID. |
| `/alert pause id:<n>` / `/alert resume id:<n>` | Temporarily disable / re-enable an alert without losing it. |

The alerts worker polls hourly by default (override via `ALERTS_CRON` env var). Alerts have a 24-hour cool-down so a card sitting just past its threshold won't spam you.

### 📦 Portfolio

| Command | What it does |
|---|---|
| `/portfolio add card:<name> [qty] [purchase_price]` | Add a card to your portfolio with optional quantity and per-copy purchase price. |
| `/portfolio show` | List your holdings with **live valuations**, total portfolio value, and **P&L vs purchase price**. |
| `/portfolio remove card:<name>` | Drop a card. Autocomplete suggests only cards you actually own. |

Portfolios are scoped per (user, guild) so you can keep separate stashes in different servers.

### 🏆 Server-wide

| Command | What it does |
|---|---|
| `/leaderboard portfolios` | Top portfolio holders in this server, ranked by current total value (live re-priced). |
| `/leaderboard cards` | Cards with the most active alert subscribers in this server. |
| `/games` | List every supported trading card game and its catalog size. |

### ⚙️ Admin (`Manage Server` permission)

| Command | What it does |
|---|---|
| `/config show` | Display this server's bot config. |
| `/config default-game <game>` | Set a default game for `/price` calls without an explicit `game:` filter. Massive QoL for single-game servers. |
| `/config clear-default-game` | Remove the default-game filter. |
| `/config locale <locale>` | Set the bot's response language for this server (en, pl, fr, de, es, it, ja, nl, pt-BR). |
| `/config daily-report channel:<channel> enabled:<bool>` | Configure the channel where the bot posts a daily market report at 09:00 UTC. |
| `/config notify-set-releases channel:<channel>` | Pick a channel to be notified whenever a new set is added to the API catalogue. |

### Help

| Command | What it does |
|---|---|
| `/help` | Bot usage, command list, and credits. |

## Quick start (local development)

You need:

- **Node.js 18+**
- A **Discord bot token** — create one at [discord.com/developers/applications](https://discord.com/developers/applications)
- A **TCG Price Lookup API key** — get one free at [tcgpricelookup.com/tcg-api](https://tcgpricelookup.com/tcg-api)

### 1. Install

```bash
git clone https://github.com/TCG-Price-Lookup/tcg-discord-bot.git
cd tcg-discord-bot
npm install
```

### 2. Configure

```bash
cp .env.example .env
# Edit .env and fill in DISCORD_TOKEN, DISCORD_CLIENT_ID, and TCGLOOKUP_API_KEY.
# For development, also set DISCORD_GUILD_ID to your test server's ID for
# instant slash command updates (global commands take ~1h to propagate).
```

### 3. Register slash commands with Discord

```bash
npm run deploy-commands
```

You only need to run this when you add or change a command. With `DISCORD_GUILD_ID` set, commands appear in your test server immediately.

### 4. Run the bot

```bash
npm run dev      # tsx watch mode for development
# or
npm run build && npm start    # production
```

### 5. Invite the bot to your server

In the Discord Developer Portal, go to **OAuth2 → URL Generator**:

- Scopes: `bot`, `applications.commands`
- Bot permissions: `Send Messages`, `Embed Links`, `Use Slash Commands`

Open the generated URL in a browser and authorise the bot for your server.

## Production deployment

The bot is a stateless long-running Node.js process. Any platform that runs Node 18+ works:

### Docker

```bash
docker build -t tcg-discord-bot .
docker run -d --restart unless-stopped \
  -e DISCORD_TOKEN=... \
  -e DISCORD_CLIENT_ID=... \
  -e TCGLOOKUP_API_KEY=... \
  tcg-discord-bot
```

### Railway / Render / fly.io

1. Connect your fork to the platform
2. Set environment variables (`DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `TCGLOOKUP_API_KEY`)
3. Build command: `npm run build`
4. Start command: `npm start`

Don't forget to run `npm run deploy-commands` once after deploying — locally or via a one-off job — to register the slash commands with Discord. You only need to re-run it when commands change.

### Self-hosted with systemd

```ini
# /etc/systemd/system/tcg-discord-bot.service
[Unit]
Description=TCG Price Lookup Discord Bot
After=network.target

[Service]
Type=simple
User=botuser
WorkingDirectory=/opt/tcg-discord-bot
EnvironmentFile=/opt/tcg-discord-bot/.env
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

## Architecture

```
src/
├── index.ts              # Bot entry: login + interaction dispatch + scheduler
├── deploy-commands.ts    # One-shot script to register commands with Discord
├── commands/
│   ├── index.ts          # Command registry (single source of truth)
│   ├── price.ts          # /price — search with autocomplete + pagination
│   ├── card.ts           # /card — by UUID
│   ├── find.ts           # /find — cross-game search
│   ├── compare.ts        # /compare — side-by-side
│   ├── random.ts         # /random — random card pull
│   ├── set.ts            # /set — browse a set
│   ├── history.ts        # /history — chart image (Trader plan)
│   ├── alert.ts          # /alert — price alerts (subcommands)
│   ├── portfolio.ts      # /portfolio — collection tracking (subcommands)
│   ├── leaderboard.ts    # /leaderboard — server rankings
│   ├── config.ts         # /config — admin settings (subcommands)
│   ├── games.ts          # /games — list games
│   └── help.ts           # /help — usage
├── workers/
│   ├── alertsWorker.ts          # Cron: poll alerts + fire DMs/channel posts
│   ├── setsWorker.ts            # Cron: poll for new sets, post to notify channels
│   └── dailyReportWorker.ts     # Cron: post daily market summaries
├── i18n/
│   ├── en.json           # English translations
│   └── pl.json           # Polish translations
└── lib/
    ├── env.ts            # Strict env var parsing (incl. DATA_DIR)
    ├── sdk.ts            # Shared TCG Price Lookup client
    ├── db.ts             # better-sqlite3 setup + schema migrations
    ├── alertRepo.ts      # Prepared statements for alerts table
    ├── portfolioRepo.ts  # Prepared statements for portfolios table
    ├── setsRepo.ts       # Prepared statements for known_sets table
    ├── serverConfig.ts   # Cached per-guild config (with write-through)
    ├── scheduler.ts      # node-cron wrapper + job registry
    ├── chart.ts          # quickchart.io URL builder for /history
    ├── pagination.ts     # Button row builder + customId codec
    ├── i18n.ts           # Locale lookup with EN fallback
    ├── format.ts         # Discord embed builders
    └── errors.ts         # SDK error → user-friendly message
```

**Adding a new command:** create a file in `src/commands/`, export `{ data, execute }` (plus optional `autocomplete` and `handleButton` for richer interactions), and register it in the `commands` array in `src/commands/index.ts`. The deploy script and runtime dispatcher both read from that single registry.

**Adding a new background job:** create a file in `src/workers/`, call `registerJob({ name, cron, handler })` at module load, and add a side-effect import in `src/index.ts`. The scheduler picks it up automatically on `ClientReady`.

## Persistent storage

The bot uses **SQLite** (via `better-sqlite3`) for alerts, portfolios, server config, and known-set bookkeeping. The database file lives in `${DATA_DIR}/bot.db` (default `./data/bot.db`). In Docker, mount `/app/data` as a volume to persist state across container restarts:

```bash
docker run -d --restart unless-stopped \
  -v tcgbot-data:/app/data \
  -e DISCORD_TOKEN=... \
  -e DISCORD_CLIENT_ID=... \
  -e TCGLOOKUP_API_KEY=... \
  tcg-discord-bot
```

## Free vs Trader plan

The bot honours whichever plan your `TCGLOOKUP_API_KEY` is on:

- **Free plan** — TCGPlayer market prices for every card. The eBay rows and graded rows in the embeds will be empty.
- **Trader plan and above** — eBay sold averages, full PSA / BGS / CGC graded prices, daily price history.

Compare plans at [tcgpricelookup.com/pricing](https://tcgpricelookup.com/pricing). For a community Discord with regular use, Trader pays for itself in better-looking embeds and access to graded data.

## Customisation ideas

- **Card images** — already enabled via `setThumbnail` in `format.ts`. Switch to `setImage` for full-size hero images.
- **Localised text** — replace the strings in `commands/help.ts` and `lib/format.ts` with your own server's language.
- **Alerts** — add a `/alert` command that watches a card and DMs the user when it hits a threshold. The Trader plan exposes `cards.history()` to power this.
- **Portfolio** — add `/portfolio add` / `/portfolio show` commands that store card IDs in a small SQLite DB and re-price them on demand.

## Sister projects

- **[awesome-tcg](https://github.com/TCG-Price-Lookup/awesome-tcg)** — full TCG Price Lookup ecosystem index
- **[tcglookup-js](https://github.com/TCG-Price-Lookup/tcglookup-js)** — JavaScript / TypeScript SDK (powers this bot)
- **[tcglookup CLI](https://github.com/TCG-Price-Lookup/tcglookup-cli)** — terminal client
- **[tcg-api-examples](https://github.com/TCG-Price-Lookup/tcg-api-examples)** — code samples in 8 languages

## License

MIT — see [LICENSE](LICENSE).

---

Built by [TCG Price Lookup](https://tcgpricelookup.com). Get a free API key at [tcgpricelookup.com/tcg-api](https://tcgpricelookup.com/tcg-api).
