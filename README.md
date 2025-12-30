# VerraVoice (Ashes of Creation Discord Bot)

VerraVoice is a Discord bot for organizing **Ashes of Creation** communities around settlements: channels/roles per settlement, a mayor verification workflow, and automated announcements + reminders.

This repository is published primarily for transparency and trust. Most community admins will not run their own instance: there is a single production bot hosted by the maintainer that you invite to your server.

## Invite (hosted bot)
- Invite link: `https://discord.com/oauth2/authorize?client_id=1454530015151657247&scope=bot%20applications.commands&permissions=268520464`
- You need **Manage Server** (or **Administrator**) to add the bot and run initial setup.

## What it's for
If your Discord server wants structure around settlements (who's mayor, who are citizens, where to post announcements, and when wars/elections happen), VerraVoice gives you:
- A settlement registry per server (your server's data is separate from other servers)
- Standardized channels/roles created by the bot so you don't have to build the structure manually
- Moderated "mayor claim" verification (with approve/deny buttons)
- Reminders and announcements for time-based events (wars, elections, schedules)

## What the bot does (features)
- Auto-creates settlement channels + roles (mayor/citizen/view)
- Enforces **one mayor per settlement**
- Mayor claim workflow:
  - Users submit a claim + proof (proof is collected via DM)
  - Staff approve/deny with buttons in a private review channel
- Bot-managed embeds auto-update:
  - Per-settlement status card
  - Server overview (`#server-overview`)
- Self-assign panel for users:
  - Settlement citizenship (one settlement at a time)
  - Optional read-only "view" roles
  - Guild Leader / Guild Officer role requests (with staff approval)
- Scheduled reminders:
  - Elections
  - Wars / sieges
  - Generic reminders

## Before you install (important)
1. **Bot role position**
   - The bot's highest role must be above any roles it needs to create/assign (otherwise role assignment will fail).
2. **Discord permissions**
   - The bot needs `Manage Channels`, `Manage Roles`, `Send Messages`, `Embed Links`, `Read Message History`.
3. **Clean install is destructive**
   - `/setup init clean_install:true` attempts to delete existing channels/roles (best-effort). Use only on a fresh test server unless you're sure you want that behavior.

## Quick start (server admin)
1. Invite the bot (link above).
2. Run `/setup init` in the server.
3. (Optional) Run `/setup timezone` so the bot parses dates in your server's timezone.
4. Choose how to populate settlements:
   - Use the built-in catalog via `/setup populate` (or rerun `/setup init`), or
   - Add only the settlements you want via `/settlement add`.
5. Tell your community:
   - Use `#self-assign` to pick settlement citizenship and view preferences.
   - Mayors use `/mayor claim` (or the button in `#mayor-requests`) to start verification.

## Key commands (admin/staff)
- `/setup init`: Creates/repairs the bot-managed structure in your server.
- `/setup timezone`: Sets the timezone used for parsing dates in commands.
- `/setup populate`: Creates settlement structure from the built-in catalog.
- `/settlement add|list|info|set-tier|update|announce|destroyed`: Manage settlements and announcements.
- `/mayor claim|approve|deny|assign|clear`: Mayor verification workflow and moderation actions.
- `/election set|clear|trigger-ue`: Election scheduling and reminders.
- `/war declare`: War/siege reminders.
- `/schedule create|list|cancel`: Generic scheduled reminders.

## What `/setup init` creates (overview)
VerraVoice creates bot-managed categories/channels/roles to support the workflows. The exact names may evolve, but the intention is:
- Public info + onboarding (rules/self-assign/mayor guides/overview)
- Settlement organization (settlement channels by zone + settlement updates)
- Staff review (a private requests channel with approve/deny buttons)

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

## Privacy and data handling
- VerraVoice stores per-server configuration and state needed to operate the workflows (settlements, role/channel IDs, pending requests, schedules).
- Mayor proof images are handled through Discord; the bot stores the proof URL/metadata to associate proof with a claim.

## Limitations (hosted bot)
- Server-specific custom settlement catalogs are not currently exposed as a per-server feature of the hosted bot.
- If you need additions/changes to the built-in settlement list or behavior, contact the maintainer (or open an issue with your request).

## Troubleshooting
- **I don't see slash commands:** Discord can take a bit to surface commands; try reinviting the bot, waiting a little, or checking on another client.
- **Setup fails / missing permissions:** check the bot's role position and that it has the permissions listed above.
- **Roles won't assign:** the bot's highest role must be above the roles it is trying to assign.

## For developers / transparency
This repo exists so communities can audit changes and understand what the hosted bot does. Self-hosting is not a supported path for typical server admins.

- Technical docs: `docs/ashes-discord-bot.md`

