# Ashes Discord Bot (product + tech design)

This bot is aimed at **community server management** (not guild systems). It helps admins/mods and settlement leadership keep citizens informed:
- Which settlements exist and what **tier** they are (0-5)
- Who is the current **mayor** (tier 3+)
- Election schedules + reminders (scheduled and unscheduled)
- Settlement status: buildings, buy orders, notes, war declarations

## Core concepts
- **Discord guild** = one community server.
- **Settlement** = a named location on that realm.
- **Tier**: `0..5` (Wilderness -> City).
- **Mayor**: required for tier `>= 3`, lasts 30 days (tracked, but reality is player-reported).
- **Elections**:
  - Scheduled monthly (registration opens 5 days before 1st; voting 1st-5th).
  - Unscheduled elections are 24h registration + 24h voting.
  - Elections can be out of sync; the bot supports per-settlement schedules.

## MVP workflow
1. Admin runs `/setup init` to create bot-managed categories/channels.
   - Optional: enable `clean_install` to delete existing channels/roles first (best-effort).
2. Players read `#mayor-requests` for the verification process.
3. Players start a claim via the `#mayor-requests` **Start Mayor Claim** button (form), then upload proof via DM.
4. Moderators review requests in the private `#requests` channel (under `VerraVoice - Moderation`) and approve/deny via buttons.
5. Players use `#self-assign` to select:
   - Their settlement citizenship (zone → settlement; one at a time)
   - Optional read-only access to other settlements via `View <Settlement>` roles (configured by zone)
   - Optional read-only access to entire zones via `View Zone - <Zone>` roles
   - `Guild Leader` / `Guild Officer` role requests (moderator approval via buttons)
6. Admin adds settlements via `/settlement add` (optional; only needed if you don't want the built-in catalog).
7. Mayors use `/settlement update` to keep their status card current.
8. Mods/mayors set election & war times; the bot posts reminders automatically.
9. The bot maintains a `server-overview` embed with all settlements/tier/mayor.
10. Each zone category has a `#mayors-<zone>` channel: citizens can read, only mayors can post.
11. Verified mayors also receive the global hoisted `Mayor` role (so online mayors show separately in the member list).
12. The overview includes each mayor's in-game guild name (captured from the mayor claim request when available).

## Slash commands (MVP)
- `/setup init|timezone|populate`
- `/settlement add|list|set-tier|update|info|announce|destroyed`
- `/mayor claim|approve|deny|assign|clear`
- `/election set|clear|trigger-ue`
- `/schedule create|list|cancel` (generic scheduled reminders)
- `/war declare` (attacker + defender)

## Setup output (high level)
`/setup init` creates:
- `VerraVoice` (category): `#server-overview`, `#settlement-updates`, `#mayor-requests`, `#mayor-how-to` (mayors only)
- `VerraVoice` (category): `#all-mayors` (mayors only)
- `VerraVoice - Moderation` (category): `#requests` (private)
- `VerraVoice - Moderation` (category): `#moderator-chat` (mods/admins) and `#admin-chat` (admins only)
- `Info` (category): `#server-announcements`, `#rules`, `#self-assign`
- `General` (category): forums + chat channels
- `General` (category): `#guild-leadership` (guild leaders/officers only)
- One category per zone + settlement channels from the built-in catalog

## Timezones and date input
- Set the server timezone with `/setup timezone` (IANA name like `Europe/Oslo` or `UTC`).
- Date inputs accept `YYYY-MM-DD HH:mm` in the configured timezone (or ISO like `2026-02-01T00:00`).

## Adding the bot to multiple servers + command sync
- Invite the bot to any server using the OAuth2 URL (same bot can be in many servers).
- Run `/setup init` separately in each server to create its channels/roles.
- Slash command registration:
  - **Global commands** (`COMMANDS_MODE=global`): commands work in every server the bot is in, but updates can take up to ~1 hour to appear.
  - **Guild commands** (`COMMANDS_MODE=guild` + `DEV_GUILD_ID=<serverId>`): updates appear instantly, but only in that one server.
  - If you see duplicates in the command picker, you likely have both global + guild commands registered; run once with `COMMANDS_CLEANUP=true` to remove the other scope.

## Data + future-proofing
The bot stores state in `data/state.json` with schema validation. The storage layer is intentionally isolated so it can later be swapped to SQLite/Postgres without changing command logic.

## Security
- Do not paste tokens in chat/logs.
- Keep `DISCORD_TOKEN` only in `.env` (ignored by git).
