import { ChannelType, TextChannel } from "discord.js";
import { DateTime } from "luxon";
import { MessageFlags } from "discord-api-types/v10";
import { Settlement } from "../../state/schema";
import { newId } from "../../utils/ids";
import { canManageSettlement, isAdmin, requireGuild } from "../permissions";
import { upsertGuildOverview } from "../overview";
import { CommandHandler } from "./types";

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

function findSettlement(guildState: any, input: string): Settlement | null {
  const byId = guildState?.settlements?.[input];
  if (byId) return byId;
  const lower = input.toLowerCase();
  for (const settlement of Object.values(guildState?.settlements ?? {}) as Settlement[]) {
    if (settlement.name.toLowerCase() === lower) return settlement;
  }
  return null;
}

export const handleElection: CommandHandler = async ({ interaction, store }) => {
  if (interaction.commandName !== "election") return;
  requireGuild(interaction);
  const sub = interaction.options.getSubcommand();
  const guild = interaction.guild;
  const gs = store.get().guilds[guild.id];
  if (!gs) {
    await interaction.reply({ content: "Run `/setup init` first.", flags: MessageFlags.Ephemeral });
    return;
  }
  const admin = isAdmin(interaction);

  if (sub === "set") {
    const settlementInput = interaction.options.getString("settlement", true);
    const settlement = findSettlement(gs, settlementInput);
    if (!settlement) {
      await interaction.reply({ content: "Settlement not found.", flags: MessageFlags.Ephemeral });
      return;
    }
    if (!canManageSettlement(interaction.member, settlement, admin)) {
      await interaction.reply({
        content: "Only the settlement mayor (or an admin) can set election schedules for this settlement.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const timezone = gs.config.timezone || "UTC";
    const reg = parseWhen(interaction.options.getString("registration_start", true), timezone);
    const voteStart = parseWhen(interaction.options.getString("voting_start", true), timezone);
    const voteEnd = parseWhen(interaction.options.getString("voting_end", true), timezone);
    if (!reg || !voteStart || !voteEnd) {
      await interaction.reply({
        content: `Couldn't parse time(s). Use \`YYYY-MM-DD HH:mm\` in ${timezone}, or ISO like \`2026-02-01T00:00\`.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    if (!(reg < voteStart && voteStart < voteEnd)) {
      await interaction.reply({
        content: "Times must be increasing: registration_start < voting_start < voting_end.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    if (voteEnd.toMillis() <= Date.now()) {
      await interaction.reply({ content: "Voting end must be in the future.", flags: MessageFlags.Ephemeral });
      return;
    }

    const announceChannelOpt = interaction.options.getChannel("announce_channel", false);
    const announceChannelId =
      announceChannelOpt?.isTextBased()
        ? announceChannelOpt.id
        : gs.config.announcementsChannelId ?? interaction.channelId;
    if (!announceChannelId) {
      await interaction.reply({
        content: "No announcements channel configured. Run `/setup init` first.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const mentionRole = interaction.options.getRole("mention_role", false);

    const oldIds = settlement.election.scheduleItemIds ?? [];
    await store.update(async (state) => {
      const g = state.guilds[guild.id];
      if (!g) return;
      for (const id of oldIds) delete g.schedule[id];
    });

    const idReg = newId("election_reg");
    const idVoteOpen = newId("election_voteopen");
    const idVoteEndsSoon = newId("election_voteends");
    const idVoteClose = newId("election_voteclose");
    const now = Date.now();
    const voteEndsSoonAt = voteEnd.minus({ hours: 24 });
    const includeVoteEndsSoon = voteEndsSoonAt.toMillis() > now;

    await store.update(async (state) => {
      const g = state.guilds[guild.id];
      if (!g) return;
      g.schedule[idReg] = {
        id: idReg,
        type: "election",
        settlementId: settlement.id,
        warDefenderSettlementId: null,
        warKind: null,
        discordEventId: null,
        title: `${settlement.name}: Election registration opens`,
        description: null,
        announceChannelId: announceChannelId,
        mentionRoleId: mentionRole?.id ?? null,
        startsAtMs: reg.toMillis(),
        reminderOffsetsMinutes: [0],
        sentOffsetMinutes: [],
        createdByUserId: interaction.user.id,
        createdAtMs: now,
      };
      g.schedule[idVoteOpen] = {
        id: idVoteOpen,
        type: "election",
        settlementId: settlement.id,
        warDefenderSettlementId: null,
        warKind: null,
        discordEventId: null,
        title: `${settlement.name}: Election voting is open`,
        description: null,
        announceChannelId: announceChannelId,
        mentionRoleId: mentionRole?.id ?? null,
        startsAtMs: voteStart.toMillis(),
        reminderOffsetsMinutes: [0],
        sentOffsetMinutes: [],
        createdByUserId: interaction.user.id,
        createdAtMs: now,
      };
      if (includeVoteEndsSoon) {
        g.schedule[idVoteEndsSoon] = {
          id: idVoteEndsSoon,
          type: "election",
          settlementId: settlement.id,
          warDefenderSettlementId: null,
          warKind: null,
          discordEventId: null,
          title: `${settlement.name}: Voting ends in 24h`,
          description: null,
          announceChannelId: announceChannelId,
          mentionRoleId: mentionRole?.id ?? null,
          startsAtMs: voteEndsSoonAt.toMillis(),
          reminderOffsetsMinutes: [0],
          sentOffsetMinutes: [],
          createdByUserId: interaction.user.id,
          createdAtMs: now,
        };
      }
      g.schedule[idVoteClose] = {
        id: idVoteClose,
        type: "election",
        settlementId: settlement.id,
        warDefenderSettlementId: null,
        warKind: null,
        discordEventId: null,
        title: `${settlement.name}: Voting has ended`,
        description: null,
        announceChannelId: announceChannelId,
        mentionRoleId: mentionRole?.id ?? null,
        startsAtMs: voteEnd.toMillis(),
        reminderOffsetsMinutes: [0],
        sentOffsetMinutes: [],
        createdByUserId: interaction.user.id,
        createdAtMs: now,
      };

      const s = g.settlements[settlement.id];
      if (!s) return;
      s.election.registrationStartMs = reg.toMillis();
      s.election.votingStartMs = voteStart.toMillis();
      s.election.votingEndMs = voteEnd.toMillis();
      s.election.scheduleItemIds = includeVoteEndsSoon ? [idReg, idVoteOpen, idVoteEndsSoon, idVoteClose] : [idReg, idVoteOpen, idVoteClose];
      s.updatedAtMs = now;
    });

    await interaction.reply({
      content:
        `Election schedule set for **${settlement.name}**:\n` +
        `- Registration: <t:${Math.floor(reg.toSeconds())}:F>\n` +
        `- Voting: <t:${Math.floor(voteStart.toSeconds())}:F> -> <t:${Math.floor(voteEnd.toSeconds())}:F>`,
      flags: MessageFlags.Ephemeral,
    });

    const chan = await guild.channels.fetch(announceChannelId).catch(() => null);
    if (chan && chan.type === ChannelType.GuildText) {
      await (chan as TextChannel).send(
        `Election schedule updated for **${settlement.name}**.\nRegistration: <t:${Math.floor(reg.toSeconds())}:F>\nVoting: <t:${Math.floor(
          voteStart.toSeconds(),
        )}:F> -> <t:${Math.floor(voteEnd.toSeconds())}:F>`,
      );
    }
    return;
  }

  if (sub === "clear") {
    const settlementInput = interaction.options.getString("settlement", true);
    const settlement = findSettlement(gs, settlementInput);
    if (!settlement) {
      await interaction.reply({ content: "Settlement not found.", flags: MessageFlags.Ephemeral });
      return;
    }
    if (!canManageSettlement(interaction.member, settlement, admin)) {
      await interaction.reply({
        content: "Only the settlement mayor (or an admin) can clear election schedules for this settlement.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const ids = settlement.election.scheduleItemIds ?? [];
    await store.update(async (state) => {
      const g = state.guilds[guild.id];
      if (!g) return;
      for (const id of ids) delete g.schedule[id];
      const s = g.settlements[settlement.id];
      if (!s) return;
      s.election.registrationStartMs = null;
      s.election.votingStartMs = null;
      s.election.votingEndMs = null;
      s.election.scheduleItemIds = [];
      s.updatedAtMs = Date.now();
    });
    await interaction.reply({
      content: `Cleared election schedule for **${settlement.name}**.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (sub === "trigger-ue") {
    if (!admin) {
      await interaction.reply({
        content: "You need Manage Server (or Administrator) to trigger an unscheduled election.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const settlementInput = interaction.options.getString("settlement", true);
    const reason = interaction.options.getString("reason", false);
    const settlement = findSettlement(gs, settlementInput);
    if (!settlement) {
      await interaction.reply({ content: "Settlement not found.", flags: MessageFlags.Ephemeral });
      return;
    }

    // Remove mayor role from existing mayor (if any)
    if (settlement.mayorRoleId && settlement.mayorUserId) {
      const prev = await guild.members.fetch(settlement.mayorUserId).catch(() => null);
      if (prev) await prev.roles.remove(settlement.mayorRoleId).catch(() => null);
    }

    const timezone = gs.config.timezone || "UTC";
    const reg = DateTime.now().setZone(timezone);
    const voteStart = reg.plus({ hours: 24 });
    const voteEnd = reg.plus({ hours: 48 });

    const announceChannelOpt = interaction.options.getChannel("announce_channel", false);
    const announceChannelId =
      announceChannelOpt?.isTextBased()
        ? announceChannelOpt.id
        : gs.config.announcementsChannelId ?? interaction.channelId;
    if (!announceChannelId) {
      await interaction.reply({
        content: "No announcements channel configured. Run `/setup init` first.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const mentionRole = interaction.options.getRole("mention_role", false);

    // Clear old schedule items linked to election
    const oldIds = settlement.election.scheduleItemIds ?? [];
    await store.update(async (state) => {
      const g = state.guilds[guild.id];
      if (!g) return;
      for (const id of oldIds) delete g.schedule[id];
    });

    const idVoteOpen = newId("election_voteopen");
    const idVoteClose = newId("election_voteclose");
    const now = Date.now();

    await store.update(async (state) => {
      const g = state.guilds[guild.id];
      if (!g) return;

      g.schedule[idVoteOpen] = {
        id: idVoteOpen,
        type: "election",
        settlementId: settlement.id,
        warDefenderSettlementId: null,
        warKind: null,
        discordEventId: null,
        title: `${settlement.name}: Unscheduled election voting is open`,
        description: null,
        announceChannelId: announceChannelId,
        mentionRoleId: mentionRole?.id ?? null,
        startsAtMs: voteStart.toMillis(),
        reminderOffsetsMinutes: [0],
        sentOffsetMinutes: [],
        createdByUserId: interaction.user.id,
        createdAtMs: now,
      };
      g.schedule[idVoteClose] = {
        id: idVoteClose,
        type: "election",
        settlementId: settlement.id,
        warDefenderSettlementId: null,
        warKind: null,
        discordEventId: null,
        title: `${settlement.name}: Unscheduled election voting ends`,
        description: null,
        announceChannelId: announceChannelId,
        mentionRoleId: mentionRole?.id ?? null,
        startsAtMs: voteEnd.toMillis(),
        reminderOffsetsMinutes: [60, 15, 0],
        sentOffsetMinutes: [],
        createdByUserId: interaction.user.id,
        createdAtMs: now,
      };

      const s = g.settlements[settlement.id];
      if (!s) return;
      s.mayorUserId = null;
      s.mayorSinceMs = null;
      s.mayorUntilMs = null;
      s.election.registrationStartMs = reg.toMillis();
      s.election.votingStartMs = voteStart.toMillis();
      s.election.votingEndMs = voteEnd.toMillis();
      s.election.scheduleItemIds = [idVoteOpen, idVoteClose];
      s.updatedAtMs = now;
    });

    const chan = await guild.channels.fetch(announceChannelId).catch(() => null);
    if (chan && chan.type === ChannelType.GuildText) {
      const mention = mentionRole ? `<@&${mentionRole.id}> ` : "";
      await (chan as TextChannel).send({
        content:
          `${mention}**Unscheduled election triggered** for **${settlement.name}**.\nRegistration: <t:${Math.floor(
            reg.toSeconds(),
          )}:F> (24h)\nVoting: <t:${Math.floor(voteStart.toSeconds())}:F> -> <t:${Math.floor(voteEnd.toSeconds())}:F>` +
          `${reason?.trim() ? `\nReason: ${reason.trim()}` : ""}`,
        allowedMentions: mentionRole ? { roles: [mentionRole.id] } : { parse: [] },
      });
    }

    await interaction.reply({
      content:
        `Unscheduled election triggered for **${settlement.name}**:\n` +
        `- Registration: <t:${Math.floor(reg.toSeconds())}:F> (24h)\n` +
        `- Voting: <t:${Math.floor(voteStart.toSeconds())}:F> -> <t:${Math.floor(voteEnd.toSeconds())}:F>`,
      flags: MessageFlags.Ephemeral,
    });
    await upsertGuildOverview(guild, store);
    return;
  }
};
