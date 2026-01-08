"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleElection = void 0;
const discord_js_1 = require("discord.js");
const luxon_1 = require("luxon");
const v10_1 = require("discord-api-types/v10");
const ids_1 = require("../../utils/ids");
const permissions_1 = require("../permissions");
const overview_1 = require("../overview");
function parseWhen(input, timezone) {
    const formats = ["yyyy-MM-dd HH:mm", "yyyy-MM-dd H:mm", "yyyy-MM-dd'T'HH:mm", "yyyy-MM-dd'T'HH:mm:ss"];
    for (const fmt of formats) {
        const dt = luxon_1.DateTime.fromFormat(input, fmt, { zone: timezone });
        if (dt.isValid)
            return dt;
    }
    const iso = luxon_1.DateTime.fromISO(input, { zone: timezone });
    if (iso.isValid)
        return iso;
    return null;
}
function findSettlement(guildState, input) {
    const byId = guildState?.settlements?.[input];
    if (byId)
        return byId;
    const lower = input.toLowerCase();
    for (const settlement of Object.values(guildState?.settlements ?? {})) {
        if (settlement.name.toLowerCase() === lower)
            return settlement;
    }
    return null;
}
const handleElection = async ({ interaction, store }) => {
    if (interaction.commandName !== "election")
        return;
    (0, permissions_1.requireGuild)(interaction);
    const sub = interaction.options.getSubcommand();
    const guild = interaction.guild;
    const gs = store.get().guilds[guild.id];
    if (!gs) {
        await interaction.reply({ content: "Run `/setup init` first.", flags: v10_1.MessageFlags.Ephemeral });
        return;
    }
    const admin = (0, permissions_1.isAdmin)(interaction);
    if (sub === "set") {
        const settlementInput = interaction.options.getString("settlement", true);
        const settlement = findSettlement(gs, settlementInput);
        if (!settlement) {
            await interaction.reply({ content: "Settlement not found.", flags: v10_1.MessageFlags.Ephemeral });
            return;
        }
        if (!(0, permissions_1.canManageSettlement)(interaction.member, settlement, admin)) {
            await interaction.reply({
                content: "Only the settlement mayor (or an admin) can set election schedules for this settlement.",
                flags: v10_1.MessageFlags.Ephemeral,
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
                flags: v10_1.MessageFlags.Ephemeral,
            });
            return;
        }
        if (!(reg < voteStart && voteStart < voteEnd)) {
            await interaction.reply({
                content: "Times must be increasing: registration_start < voting_start < voting_end.",
                flags: v10_1.MessageFlags.Ephemeral,
            });
            return;
        }
        if (voteEnd.toMillis() <= Date.now()) {
            await interaction.reply({ content: "Voting end must be in the future.", flags: v10_1.MessageFlags.Ephemeral });
            return;
        }
        const announceChannelOpt = interaction.options.getChannel("announce_channel", false);
        const announceChannelId = announceChannelOpt?.isTextBased()
            ? announceChannelOpt.id
            : gs.config.announcementsChannelId ?? interaction.channelId;
        if (!announceChannelId) {
            await interaction.reply({
                content: "No announcements channel configured. Run `/setup init` first.",
                flags: v10_1.MessageFlags.Ephemeral,
            });
            return;
        }
        const mentionRole = interaction.options.getRole("mention_role", false);
        const oldIds = settlement.election.scheduleItemIds ?? [];
        await store.update(async (state) => {
            const g = state.guilds[guild.id];
            if (!g)
                return;
            for (const id of oldIds)
                delete g.schedule[id];
        });
        const regDurationHours = Math.max(1, Math.round(voteStart.diff(reg, "hours").hours));
        const voteDurationHours = Math.max(1, Math.round(voteEnd.diff(voteStart, "hours").hours));
        const settlementChannel = settlement.channelId ? `<#${settlement.channelId}>` : settlement.name;
        const registrationDescription = `Registration open for **${settlement.name}**. Duration: ~${regDurationHours}h. Candidates: register in-game; share your plans in ${settlementChannel}.`;
        const votingDescription = `Voting open for **${settlement.name}**. Duration: ~${voteDurationHours}h. One vote per account; last vote per account counts.`;
        const votingEndsSoonDescription = `Voting for **${settlement.name}** ends in 24h. Make sure your vote is in.`;
        const votingClosedDescription = `Voting closed for **${settlement.name}**. Results update when the game finalizes the winner.`;
        const idReg = (0, ids_1.newId)("election_reg");
        const idVoteOpen = (0, ids_1.newId)("election_voteopen");
        const idVoteEndsSoon = (0, ids_1.newId)("election_voteends");
        const idVoteClose = (0, ids_1.newId)("election_voteclose");
        const now = Date.now();
        const voteEndsSoonAt = voteEnd.minus({ hours: 24 });
        const includeVoteEndsSoon = voteEndsSoonAt.toMillis() > now;
        const mentionRoleId = mentionRole?.id ?? null;
        const reminderBase = [1440, 60, 15, 0];
        const regReminderOffsets = reminderBase.filter((m) => m * 60 * 1000 <= voteStart.toMillis() - reg.toMillis());
        const voteReminderOffsets = reminderBase.filter((m) => m * 60 * 1000 <= voteEnd.toMillis() - voteStart.toMillis());
        await store.update(async (state) => {
            const g = state.guilds[guild.id];
            if (!g)
                return;
            g.schedule[idReg] = {
                id: idReg,
                type: "election",
                settlementId: settlement.id,
                warDefenderSettlementId: null,
                warKind: null,
                discordEventId: null,
                title: `${settlement.name}: Election registration opens`,
                description: registrationDescription,
                announceChannelId: announceChannelId,
                mentionRoleId,
                startsAtMs: reg.toMillis(),
                reminderOffsetsMinutes: regReminderOffsets.length ? regReminderOffsets : [60, 0],
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
                description: votingDescription,
                announceChannelId: announceChannelId,
                mentionRoleId,
                startsAtMs: voteStart.toMillis(),
                reminderOffsetsMinutes: voteReminderOffsets.length ? voteReminderOffsets : [60, 0],
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
                    description: votingEndsSoonDescription,
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
                description: votingClosedDescription,
                announceChannelId: announceChannelId,
                mentionRoleId: mentionRole?.id ?? null,
                startsAtMs: voteEnd.toMillis(),
                reminderOffsetsMinutes: [0],
                sentOffsetMinutes: [],
                createdByUserId: interaction.user.id,
                createdAtMs: now,
            };
            const s = g.settlements[settlement.id];
            if (!s)
                return;
            s.election.registrationStartMs = reg.toMillis();
            s.election.votingStartMs = voteStart.toMillis();
            s.election.votingEndMs = voteEnd.toMillis();
            s.election.scheduleItemIds = includeVoteEndsSoon ? [idReg, idVoteOpen, idVoteEndsSoon, idVoteClose] : [idReg, idVoteOpen, idVoteClose];
            s.updatedAtMs = now;
        });
        await interaction.reply({
            content: `Election schedule set for **${settlement.name}**:\n` +
                `- Registration: <t:${Math.floor(reg.toSeconds())}:F> (approx ${regDurationHours}h)\n` +
                `- Voting: <t:${Math.floor(voteStart.toSeconds())}:F> -> <t:${Math.floor(voteEnd.toSeconds())}:F> (approx ${voteDurationHours}h)\n` +
                `Tip: candidates can share plans in ${settlementChannel}. One vote per account; last vote counts.`,
            flags: v10_1.MessageFlags.Ephemeral,
        });
        const chan = await guild.channels.fetch(announceChannelId).catch(() => null);
        if (chan && chan.type === discord_js_1.ChannelType.GuildText) {
            await chan.send(`Election schedule updated for **${settlement.name}**.\n` +
                `Registration: <t:${Math.floor(reg.toSeconds())}:F> (approx ${regDurationHours}h)\n` +
                `Voting: <t:${Math.floor(voteStart.toSeconds())}:F> -> <t:${Math.floor(voteEnd.toSeconds())}:F> (approx ${voteDurationHours}h)\n` +
                `Candidates: register in-game; share your plans in ${settlementChannel}. One vote per account; last vote counts.`);
        }
        return;
    }
    if (sub === "clear") {
        const settlementInput = interaction.options.getString("settlement", true);
        const settlement = findSettlement(gs, settlementInput);
        if (!settlement) {
            await interaction.reply({ content: "Settlement not found.", flags: v10_1.MessageFlags.Ephemeral });
            return;
        }
        if (!(0, permissions_1.canManageSettlement)(interaction.member, settlement, admin)) {
            await interaction.reply({
                content: "Only the settlement mayor (or an admin) can clear election schedules for this settlement.",
                flags: v10_1.MessageFlags.Ephemeral,
            });
            return;
        }
        const ids = settlement.election.scheduleItemIds ?? [];
        await store.update(async (state) => {
            const g = state.guilds[guild.id];
            if (!g)
                return;
            for (const id of ids)
                delete g.schedule[id];
            const s = g.settlements[settlement.id];
            if (!s)
                return;
            s.election.registrationStartMs = null;
            s.election.votingStartMs = null;
            s.election.votingEndMs = null;
            s.election.scheduleItemIds = [];
            s.updatedAtMs = Date.now();
        });
        await interaction.reply({
            content: `Cleared election schedule for **${settlement.name}**.`,
            flags: v10_1.MessageFlags.Ephemeral,
        });
        return;
    }
    if (sub === "trigger-ue") {
        if (!admin) {
            await interaction.reply({
                content: "You need Manage Server (or Administrator) to trigger an unscheduled election.",
                flags: v10_1.MessageFlags.Ephemeral,
            });
            return;
        }
        const settlementInput = interaction.options.getString("settlement", true);
        const reason = interaction.options.getString("reason", false);
        const settlement = findSettlement(gs, settlementInput);
        if (!settlement) {
            await interaction.reply({ content: "Settlement not found.", flags: v10_1.MessageFlags.Ephemeral });
            return;
        }
        // Remove mayor role from existing mayor (if any)
        if (settlement.mayorRoleId && settlement.mayorUserId) {
            const prev = await guild.members.fetch(settlement.mayorUserId).catch(() => null);
            if (prev)
                await prev.roles.remove(settlement.mayorRoleId).catch(() => null);
        }
        const timezone = gs.config.timezone || "UTC";
        const reg = luxon_1.DateTime.now().setZone(timezone);
        const voteStart = reg.plus({ hours: 24 });
        const voteEnd = reg.plus({ hours: 48 });
        const announceChannelOpt = interaction.options.getChannel("announce_channel", false);
        const announceChannelId = announceChannelOpt?.isTextBased()
            ? announceChannelOpt.id
            : gs.config.announcementsChannelId ?? interaction.channelId;
        if (!announceChannelId) {
            await interaction.reply({
                content: "No announcements channel configured. Run `/setup init` first.",
                flags: v10_1.MessageFlags.Ephemeral,
            });
            return;
        }
        const mentionRole = interaction.options.getRole("mention_role", false);
        // Clear old schedule items linked to election
        const oldIds = settlement.election.scheduleItemIds ?? [];
        await store.update(async (state) => {
            const g = state.guilds[guild.id];
            if (!g)
                return;
            for (const id of oldIds)
                delete g.schedule[id];
        });
        const idVoteOpen = (0, ids_1.newId)("election_voteopen");
        const idVoteClose = (0, ids_1.newId)("election_voteclose");
        const now = Date.now();
        await store.update(async (state) => {
            const g = state.guilds[guild.id];
            if (!g)
                return;
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
            if (!s)
                return;
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
        if (chan && chan.type === discord_js_1.ChannelType.GuildText) {
            const mention = mentionRole ? `<@&${mentionRole.id}> ` : "";
            await chan.send({
                content: `${mention}**Unscheduled election triggered** for **${settlement.name}**.\nRegistration: <t:${Math.floor(reg.toSeconds())}:F> (24h)\nVoting: <t:${Math.floor(voteStart.toSeconds())}:F> -> <t:${Math.floor(voteEnd.toSeconds())}:F>` +
                    `${reason?.trim() ? `\nReason: ${reason.trim()}` : ""}`,
                allowedMentions: mentionRole ? { roles: [mentionRole.id] } : { parse: [] },
            });
        }
        await interaction.reply({
            content: `Unscheduled election triggered for **${settlement.name}**:\n` +
                `- Registration: <t:${Math.floor(reg.toSeconds())}:F> (24h)\n` +
                `- Voting: <t:${Math.floor(voteStart.toSeconds())}:F> -> <t:${Math.floor(voteEnd.toSeconds())}:F>`,
            flags: v10_1.MessageFlags.Ephemeral,
        });
        await (0, overview_1.upsertGuildOverview)(guild, store);
        return;
    }
};
exports.handleElection = handleElection;
