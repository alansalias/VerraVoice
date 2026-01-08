"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleStatus = void 0;
const discord_js_1 = require("discord.js");
const v10_1 = require("discord-api-types/v10");
const permissions_1 = require("../permissions");
function fmtList(items) {
    return items.length ? items.join(", ") : "None";
}
const handleStatus = async ({ interaction, store }) => {
    if (interaction.commandName !== "status")
        return;
    (0, permissions_1.requireGuild)(interaction);
    if (!(0, permissions_1.isAdmin)(interaction)) {
        await interaction.reply({
            content: "You need Manage Server (or Administrator) to run this.",
            flags: v10_1.MessageFlags.Ephemeral,
        });
        return;
    }
    const guild = interaction.guild;
    const state = store?.get()?.guilds?.[guild.id];
    if (!state) {
        await interaction.reply({
            content: "Server is not initialized. Run `/setup init` first.",
            flags: v10_1.MessageFlags.Ephemeral,
        });
        return;
    }
    const botMember = guild.members.me ?? (await guild.members.fetchMe());
    const config = state.config ?? {};
    const channelChecks = [];
    const missingChannels = [];
    const channelsToCheck = [
        { id: config.settlementsCategoryId, label: "Settlements category" },
        { id: config.moderationCategoryId, label: "Moderation category" },
        { id: config.infoCategoryId, label: "Info category" },
        { id: config.generalCategoryId, label: "General category" },
        { id: config.requestsChannelId, label: "Requests channel" },
        { id: config.selfAssignChannelId, label: "Self-assign channel" },
        { id: config.overviewChannelId, label: "Server overview channel" },
        { id: config.announcementsChannelId, label: "Settlement updates channel" },
        { id: config.guildManagementChannelId, label: "Guild controls channel" },
    ];
    for (const c of channelsToCheck) {
        if (!c.id)
            continue;
        const chan = await guild.channels.fetch(c.id).catch(() => null);
        if (!chan) {
            missingChannels.push(c.label);
            continue;
        }
        const perms = chan.permissionsFor(botMember);
        const lacks = [];
        for (const perm of [
            discord_js_1.PermissionFlagsBits.ViewChannel,
            discord_js_1.PermissionFlagsBits.SendMessages,
            discord_js_1.PermissionFlagsBits.EmbedLinks,
            discord_js_1.PermissionFlagsBits.ReadMessageHistory,
        ]) {
            if (!perms?.has(perm))
                lacks.push(perm.toString());
        }
        if (lacks.length) {
            channelChecks.push(`${c.label}: missing perms (${lacks.join(", ")})`);
        }
    }
    const missingRoles = [];
    const rolesToCheck = [
        { id: config.adminRoleId, label: "VerraVoice Admin role" },
        { id: config.moderatorRoleId, label: "VerraVoice Moderator role" },
        { id: config.mayorAggregateRoleId, label: "Mayor aggregate role" },
        { id: config.guildLeaderRoleId, label: "Guild Leader role" },
        { id: config.guildOfficerRoleId, label: "Guild Officer role" },
    ];
    for (const r of rolesToCheck) {
        if (!r.id)
            continue;
        const role = guild.roles.cache.get(r.id) ?? (await guild.roles.fetch(r.id).catch(() => null));
        if (!role)
            missingRoles.push(r.label);
    }
    const issues = [];
    if (!state?.config?.settlementsCategoryId)
        issues.push("Missing settlements category (run `/setup init`).");
    if (missingChannels.length)
        issues.push(`Missing channels: ${fmtList(missingChannels)}.`);
    if (channelChecks.length)
        issues.push(`Permission gaps: ${channelChecks.join("; ")}.`);
    if (missingRoles.length)
        issues.push(`Missing roles: ${fmtList(missingRoles)}.`);
    const summary = issues.length === 0
        ? "All required channels/roles look present and the bot has basic permissions."
        : issues.join("\n");
    await interaction.reply({
        content: `Status for **${guild.name}**\n${summary}\n\nTimezone: **${config.timezone ?? "UTC"}**`,
        flags: v10_1.MessageFlags.Ephemeral,
    });
};
exports.handleStatus = handleStatus;
