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

| Command | What it does |
|---|---|
| `/price <card> [game]` | Search by card name, optionally filtered to one game. Returns top 10 results with TCGPlayer market prices. If exactly one card matches, shows the full price block. |
| `/card <id>` | Fetch a single card by its UUID (the IDs you get from `/price` results). Returns the full price block: every condition, eBay sold averages, PSA / BGS / CGC graded prices. |
| `/games` | List every supported trading card game and its catalog size. |
| `/help` | Bot usage and credits. |

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
├── index.ts              # Bot entry: login + interaction dispatch
├── deploy-commands.ts    # One-shot script to register commands with Discord
├── commands/
│   ├── index.ts          # Command registry (single source of truth)
│   ├── price.ts          # /price — search by name
│   ├── card.ts           # /card — by UUID
│   ├── games.ts          # /games — list games
│   └── help.ts           # /help — usage
└── lib/
    ├── env.ts            # Strict env var parsing
    ├── sdk.ts            # Shared TCG Price Lookup client
    ├── format.ts         # Discord embed builders
    └── errors.ts         # SDK error → user-friendly message
```

Adding a new command means creating a file in `src/commands/`, exporting `{ data, execute }`, and adding it to the `commands` array in `src/commands/index.ts`. The deploy script and runtime dispatcher both read from that single registry.

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
