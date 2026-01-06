import { DateTime } from "luxon";
import { MessageFlags } from "discord-api-types/v10";
import { CommandHandler } from "./types";
import { isAdmin, requireGuild } from "../permissions";
import { newId } from "../../utils/ids";
import { clamp } from "../../utils/strings";

function parseReminderOffsets(input: string | null): number[] {
  if (!input?.trim()) return [1440, 60, 15, 0];
  const parts = input
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => Number(p));
  const offsets = parts.filter((n) => Number.isFinite(n) && n >= 0).map((n) => Math.floor(n));
  const unique = Array.from(new Set(offsets));
  unique.sort((a, b) => b - a);
  return unique.length ? unique : [1440, 60, 15, 0];
}

function parseWhen(input: string, timezone: string) {
  const formats = ["yyyy-MM-dd HH:mm", "yyyy-MM-dd H:mm", "yyyy-MM-dd'T'HH:mm", "yyyy-MM-dd'T'HH:mm:ss"];
  for (const fmt of formats) {
    const dt = DateTime.fromFormat(input, fmt, { zone: timezone });
    if (dt.isValid) return dt;
  }
  const iso = DateTime.fromISO(input, { zone: timezone });
  if (iso.isValid) return iso;
  return null;
}

export const handleSchedule: CommandHandler = async ({ interaction, store }) => {
  if (interaction.commandName !== "schedule") return;
  requireGuild(interaction);
  const sub = interaction.options.getSubcommand();
  const guild = interaction.guild;
  const gs = store.get().guilds[guild.id];
  if (!gs) {
    await interaction.reply({ content: "Run `/setup init` first.", flags: MessageFlags.Ephemeral });
    return;
  }

  if (sub === "create") {
    if (!isAdmin(interaction)) {
      await interaction.reply({
        content: "You need Manage Server (or Administrator) to create schedules.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const title = interaction.options.getString("title", true).trim();
    const whenInput = interaction.options.getString("when", true).trim();
    const remindersInput = interaction.options.getString("reminders", false);
    const announceChannel = interaction.options.getChannel("announce_channel", false);
    const mentionRole = interaction.options.getRole("mention_role", false);
    const settlementInput = interaction.options.getString("settlement", false);

    const timezone = gs.config.timezone || "UTC";
    const dt = parseWhen(whenInput, timezone);
    if (!dt) {
      await interaction.reply({
        content: `Couldn't parse time. Use e.g. \`2026-02-10 20:00\` (${timezone}) or ISO like \`2026-02-10T20:00\`.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const channelId =
      announceChannel?.isTextBased() ? announceChannel.id : gs.config.announcementsChannelId ?? interaction.channelId;
    if (!channelId) {
      await interaction.reply({
        content: "No announce channel configured. Run `/setup init` first.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const offsets = parseReminderOffsets(remindersInput ?? null)
      .map((n) => clamp(n, 0, 60 * 24 * 60))
      .filter((n) => Number.isFinite(n));

    const id = newId("sched");

    await store.update(async (state) => {
      const g = state.guilds[guild.id];
      if (!g) return;
      g.schedule[id] = {
        id,
        type: "generic",
        settlementId: settlementInput ?? null,
        warDefenderSettlementId: null,
        warKind: null,
        discordEventId: null,
        title,
        description: null,
        announceChannelId: channelId,
        mentionRoleId: mentionRole?.id ?? null,
        startsAtMs: dt.toMillis(),
        reminderOffsetsMinutes: offsets,
        sentOffsetMinutes: [],
        createdByUserId: interaction.user.id,
        createdAtMs: Date.now(),
      };
    });

    await interaction.reply({
      content: `Created schedule **${id}** for <t:${Math.floor(dt.toSeconds())}:F>.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (sub === "list") {
    const items = Object.values(gs.schedule ?? {})
      .filter((i: any) => i.startsAtMs > Date.now() - 60_000)
      .sort((a: any, b: any) => a.startsAtMs - b.startsAtMs)
      .slice(0, 25);
    if (!items.length) {
      await interaction.reply({ content: "No upcoming schedules.", flags: MessageFlags.Ephemeral });
      return;
    }
    const lines = items.map((i: any) => `- **${i.id}**: ${i.title} at <t:${Math.floor(i.startsAtMs / 1000)}:F>`);
    await interaction.reply({ content: lines.join("\n"), flags: MessageFlags.Ephemeral });
    return;
  }

  if (sub === "cancel") {
    if (!isAdmin(interaction)) {
      await interaction.reply({
        content: "You need Manage Server (or Administrator) to cancel schedules.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const id = interaction.options.getString("id", true);
    const item = gs.schedule?.[id];
    if (!item) {
      await interaction.reply({ content: "Schedule not found.", flags: MessageFlags.Ephemeral });
      return;
    }
    await store.update(async (state) => {
      const g = state.guilds[guild.id];
      if (!g) return;
      delete g.schedule[id];
    });
    await interaction.reply({ content: `Cancelled **${id}**.`, flags: MessageFlags.Ephemeral });
    return;
  }
};
