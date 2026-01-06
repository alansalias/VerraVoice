import { EmbedBuilder } from "discord.js";

export function buildMayorHowToEmbed() {
  return new EmbedBuilder()
    .setTitle("Mayor Guide (VerraVoice)")
    .setColor(0xf1c40f)
    .setDescription(
      [
        "This channel is visible to verified mayors. Use it as a quick reference for the tools you have available.",
        "",
        "Use the **buttons below** to open simple forms for the most common mayor actions.",
        "",
        "**Your core responsibilities (recommended)**",
        "- Keep your settlement status card accurate (tier, buildings, buy orders, notes).",
        "- Post clear announcements when something changes (tier up, election, war, major buy orders).",
        "- Avoid over-pinging; use pings when action is needed.",
      ].join("\n"),
    )
    .addFields(
      {
        name: "Update your settlement status card",
        value: [
          "Use this any time your settlement changes.",
          "- `/settlement update` (set buildings / buy orders / notes)",
          "- `/settlement set-tier` (tier 0–5)",
          "",
          "Tip: keep `buy_orders` concise and use bullet-like formatting.",
        ].join("\n"),
      },
      {
        name: "Announce to your citizens",
        value: [
          "- `/settlement announce` to post an announcement as mayor.",
          "- Enable `ping_citizens` when you need action (election, war defense, important buy order).",
          "",
          "Where to post:",
          "- Your settlement channel for discussion.",
          "- Your zone's `#mayors-<zone>` channel for mayor-only announcements (citizens can read).",
        ].join("\n"),
      },
      {
        name: "Elections (player-reported scheduling)",
        value: [
          "Mayors can set and manage schedules for their settlement:",
          "- `/election set` (registration + voting windows; creates reminders)",
          "- `/election clear`",
          "- `/election trigger-ue` (unscheduled election; 24h reg + 24h voting)",
          "",
          "Use the server timezone (`/setup timezone`) for consistent scheduling.",
        ].join("\n"),
      },
      {
        name: "Wars (scheduled reminders)",
        value: [
          "- Declare wars as attacker vs defender and schedule reminders.",
          "- Use the **Declare War** button below (recommended) or `/war declare`.",
          "- Use **Declare Siege** when the fight can result in settlement destruction.",
          "",
          "Time input uses the server timezone (set by admins via `/setup timezone`) and expects 24h format `YYYY-MM-DD HH:mm`.",
          "- The form can also create a Discord scheduled event automatically (best-effort).",
          "",
          "Include a short title and optional description with actionable instructions.",
        ].join("\n"),
      },
      {
        name: "Settlement destroyed",
        value: [
          "If your settlement is destroyed and resets:",
          "- `/settlement destroyed` (resets tier to 0 and clears mayor in the status card)",
        ].join("\n"),
      },
      {
        name: "Best practices for communication",
        value: [
          "- Make 1 announcement per event; edit/update the status card for details.",
          "- Prefer UTC timestamps in announcements (Discord renders them locally): `<t:unix:F>`.",
          "- Keep channels readable: link screenshots as proof when relevant.",
        ].join("\n"),
      },
    )
    .setFooter({ text: "VerraVoice" });
}
