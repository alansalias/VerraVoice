# VerraVoice (Ashes of Creation Discord Bot)

VerraVoice is a Discord bot for organizing **Ashes of Creation** communities around settlements: channels/roles per settlement, a mayor verification workflow, guild tooling, and automated announcements/reminders. This repository is published for transparency and trust (zero monetization). Most communities will use the hosted bot; self-hosting is unsupported but possible from this code.

## Invite (hosted bot)
- Invite link: `https://discord.com/oauth2/authorize?client_id=1454530015151657247&scope=bot%20applications.commands&permissions=268520464`
- You need **Manage Server** (or **Administrator**) to add the bot and run initial setup.

## What it's for
If your server wants structure around settlements (who's mayor, who are citizens, where to post announcements, and when wars/elections happen), VerraVoice gives you:
- A per-server settlement registry (your data is isolated per Discord server)
- Standardized channels/roles created and repaired by the bot so staff do not have to build or police the structure manually
- Moderated mayor verification (approve/deny buttons instead of DMs/spreadsheets)
- Live settlement cards and a server overview embed that stay fresh automatically
- Guild-role workflows so leaders/officers can manage invites safely
- Automated reminders/announcements for time-based events (wars, elections, schedules)

## Why different roles love it
- Guildless / new player: clear rules and self-assign in one place; see what settlements and guilds exist without pinging staff.
- Citizens: up-to-date settlement cards and announcements; pick/read the right channels and roles instantly.
- Guild leaders/officers: request leadership roles, manage your guild role in `#guild-controls`, and invite members with `/ginvite` (no manual role hunting).
- Mayors: one-click verification flow; settlement cards and overview embeds stay current without you editing anything.
- Moderators/admins: fewer tickets/DMs. Approve/deny with buttons, let the bot create/repair channels/roles, and rely on scheduled reminders and `/status` checks instead of manual pings.

## What the bot does (features)
- Settlement structure in minutes  
  - Auto-creates categories, channels, and roles per settlement (mayor/citizen/view) plus zone-level channels.  
  - Enforces **one mayor per settlement** and keeps pinned settlement status cards updated.  
  - Global `#server-overview` stays fresh automatically.
- Mayor verification without spreadsheets  
  - Users submit a claim + proof (proof via DM).  
  - Staff approve/deny with buttons; approvals update roles, status cards, and overview automatically.
- Self-serve onboarding for everyone  
  - `#self-assign` buttons for citizenship, view roles, and Guild Leader/Officer requests.  
  - Guild leaders/officers use `/ginvite` to give their guild role to members (no manual role hunting).
- Guild management tools  
  - `#guild-controls` (leaders/officers only) with an embed + buttons to rename or delete their guild role; `/ginvite` instructions included.
- Scheduled comms, zero manual pinging  
  - Elections, wars/sieges, and generic reminders with scheduled posts and optional role pings.
- Moderation time-savers  
  - Private requests channel for reviews; buttons finalize decisions.  
  - Bot ensures it can post in managed channels and keeps message pins/embeds fresh.  
  - Regular install is **non-destructive**: it reconciles and repairs existing channels/roles instead of deleting history.
- Quick help and diagnostics  
  - `/help` for a fast command refresher.  
  - `/status` for per-server config/permission checks.  
  - `/health` endpoint and structured JSON logs with request ids.

## Install modes (regular vs clean)
- **Regular install (default):** Creates missing channels/roles and moves/updates existing ones by name. Safe for live servers (does **not** delete channels or roles).
- **Clean install (destructive):** Best-effort deletes **ALL channels** (which permanently deletes chat history) and **most roles** before setting up VerraVoice. To run it you must explicitly confirm: `/setup init clean_install:true confirm_clean_install:DELETE`.

## Quick start (server admin)
1. Invite the bot (link above).
2. Run `/setup init` in the server (default regular install).
3. (Optional) Run `/setup timezone` so the bot parses dates in your server's timezone.
4. Run `/setup populate` to use the built-in settlement catalog, or add only the settlements you want with `/settlement add`.
5. Run `/status` to verify channels/roles and permissions.
6. Tell your community:
   - Use `#self-assign` to pick settlement citizenship and view preferences.
   - Mayors use `/mayor claim` (or the button in `#mayor-requests`) to start verification.

## Plug-and-play hosting (Pebblehost)
- Node version: `>=18` (set this in your Pebblehost panel).
- Start file: `dist/index.js` (already built/committed).
- Steps after cloning/pulling:
  1. Upload/compose `.env` (use `.env.example` as reference). Required: `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`; recommended: `DEV_GUILD_ID`, `LOG_LEVEL=info`, `COMMANDS_MODE=guild` while testing.
  2. Hit **Start** (Pebblehost installs deps, then runs `npm start` → `node dist/index.js`; no build needed on host).
- Health check: `GET /health` on `HEALTH_PORT` (default `3000`).
- Logs: Pebblehost console will show structured JSON logs with `reqId`.

## Key commands (admin/staff)
- `/setup init|timezone|populate`: Install/repair, set timezone, load catalog.
- `/settlement add|list|info|set-tier|update|announce|destroyed`: Manage settlements and announcements.
- `/mayor claim|approve|deny|assign|clear`: Mayor verification workflow and moderation actions.
- `/ginvite`: Guild leaders/officers can give their guild role to a member (must hold that guild role).
- `/election set|clear|trigger-ue`: Election scheduling and reminders.
- `/war declare`: War/siege reminders.
- `/schedule create|list|cancel`: Generic scheduled reminders.
- `/help`: Quick reference for key commands.
- `/status`: Check that required channels/roles exist and that the bot can post.

## What `/setup init` creates (overview)
VerraVoice creates bot-managed categories/channels/roles to support the workflows. The exact names may evolve, but the intention is:
- Public info + onboarding (rules/self-assign/mayor guides/overview)
- Settlement organization (settlement channels by zone + settlement updates)
- Staff review (a private requests channel with approve/deny buttons)
- Guild leader/officer tools (`#guild-controls` for rename/delete + `/ginvite` instructions)

Notes:
- Discord forces text channel names to be lowercase and hyphenated (so `Squall's End` becomes `#squalls-end`).
- The bot may create roles like `VerraVoice Admin` / `VerraVoice Moderator`; assign them carefully.

## How it works (day-to-day)
### Settlement membership
- Each settlement has:
  - A chat channel (citizens can write)
  - A "citizen" role (membership)
  - Optional "view" roles (read-only access)
- Users manage their own roles through `#self-assign`.

### Mayor verification
- A mayor starts a claim using `/mayor claim` (or the button in `#mayor-requests`).
- The bot collects proof (image) via DM and posts the request in the staff `#requests` channel.
- Staff approve/deny via buttons; approval assigns the mayor role and updates overview/status cards.

Who can review claims/requests:
- Users with Discord permissions like **Administrator** / **Manage Server** / **Moderate Members** / **Manage Roles**
- Or server staff you grant those permissions to (role names can differ per server)

### Elections, wars, and reminders
- Admins/mayors can schedule elections and wars (and generic reminders).
- Reminders are posted based on your server's configured timezone.

## How to run locally
1. Requirements: Node.js 18+ and npm.
2. Install deps: `npm install`.
3. Copy `.env.example` to `.env` and fill at least:
   - `DISCORD_TOKEN` (bot token)
   - `DISCORD_CLIENT_ID` (bot application id)
   - `DEV_GUILD_ID` (for fast guild-scoped command registration during dev)
   - Optional: `DEFAULT_TIMEZONE`, `COMMANDS_MODE` (`guild` for fast dev), `LOG_LEVEL`, `HEALTH_PORT`.
4. Register commands and run in dev: `npm run dev` (or `npm run typecheck` then `npm run build && npm start`).
5. Invite the bot to your test server and run `/setup init`.

## Logs and health
- Logs are structured JSON with request ids; set `LOG_LEVEL` to control verbosity.
- Health server listens on `HEALTH_PORT` (default `3000`): `GET /health` returns `{ "status": "ok" }`.

## Privacy and data handling
- VerraVoice stores per-server configuration and state needed to operate the workflows (settlements, role/channel IDs, pending requests, schedules).
- Mayor proof images are handled through Discord; the bot stores the proof URL/metadata to associate proof with a claim.

## Troubleshooting
- Run `/status` to see missing channels/roles or permission gaps.
- **I don't see slash commands:** Discord can take a bit to surface commands; try reinviting the bot, waiting a little, or checking on another client.
- **Setup fails / missing permissions:** check the bot's role position and that it has the permissions listed above.
- **Roles won't assign:** the bot's highest role must be above the roles it is trying to assign.

## For developers / transparency
This repo exists so communities can audit changes and understand what the hosted bot does. Self-hosting is not a supported path for typical server admins.

- Technical docs: `docs/ashes-discord-bot.md`
