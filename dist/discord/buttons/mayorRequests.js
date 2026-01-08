"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleMayorRequestButtons = handleMayorRequestButtons;
const discord_js_1 = require("discord.js");
const v10_1 = require("discord-api-types/v10");
const settlementCard_1 = require("../embeds/settlementCard");
const overview_1 = require("../overview");
const mayorAggregate_1 = require("../mayorAggregate");
const mayorDm_1 = require("../mayorDm");
const mayorTerm_1 = require("../mayorTerm");
function disableReviewButtons(requestId) {
    return new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.ButtonBuilder()
        .setCustomId(`mayorreq:approve:${requestId}`)
        .setLabel("Approve")
        .setStyle(discord_js_1.ButtonStyle.Success)
        .setDisabled(true), new discord_js_1.ButtonBuilder()
        .setCustomId(`mayorreq:deny:${requestId}`)
        .setLabel("Deny")
        .setStyle(discord_js_1.ButtonStyle.Danger)
        .setDisabled(true));
}
function canReview(opts) {
    const { interaction, config } = opts;
    const member = interaction.member;
    const perms = interaction.memberPermissions;
    const adminRoleId = config?.adminRoleId ?? null;
    const moderatorRoleId = config?.moderatorRoleId ?? null;
    if (!perms)
        return false;
    if (perms.has(discord_js_1.PermissionFlagsBits.Administrator) || perms.has(discord_js_1.PermissionFlagsBits.ManageGuild))
        return true;
    if (adminRoleId && member.roles.cache.has(adminRoleId))
        return true;
    if (moderatorRoleId && member.roles.cache.has(moderatorRoleId))
        return true;
    return false;
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
async function setMayorRole(opts) {
    const { guild, store, settlement, newMayorUserId } = opts;
    if (!settlement.mayorRoleId)
        return;
    const roleId = settlement.mayorRoleId;
    const mayorAggregateRoleId = await (0, mayorAggregate_1.getOrCreateMayorAggregateRoleId)(store, guild);
    const settlementMayorRoleIds = (0, mayorAggregate_1.allSettlementMayorRoleIds)(store, guild.id);
    let prevMember = null;
    let newMember = null;
    if (settlement.mayorUserId) {
        prevMember = await guild.members.fetch(settlement.mayorUserId).catch(() => null);
        if (prevMember)
            await prevMember.roles.remove(roleId).catch(() => null);
    }
    if (newMayorUserId) {
        newMember = await guild.members.fetch(newMayorUserId).catch(() => null);
        if (newMember) {
            await newMember.roles.add(roleId).catch(() => null);
            if (mayorAggregateRoleId && !newMember.roles.cache.has(mayorAggregateRoleId)) {
                await newMember.roles.add(mayorAggregateRoleId).catch(() => null);
            }
            if (mayorAggregateRoleId) {
                await (0, mayorAggregate_1.syncMayorAggregateForMember)({ member: newMember, mayorAggregateRoleId, settlementMayorRoleIds }).catch(() => null);
            }
        }
    }
    if (mayorAggregateRoleId) {
        if (prevMember) {
            await (0, mayorAggregate_1.syncMayorAggregateForMember)({ member: prevMember, mayorAggregateRoleId, settlementMayorRoleIds });
        }
        if (newMember) {
            await (0, mayorAggregate_1.syncMayorAggregateForMember)({ member: newMember, mayorAggregateRoleId, settlementMayorRoleIds });
        }
    }
}
async function upsertSettlementStatusCard(opts) {
    if (!opts.settlement.channelId)
        return;
    const channel = await opts.guild.channels.fetch(opts.settlement.channelId).catch(() => null);
    if (!channel || channel.type !== discord_js_1.ChannelType.GuildText)
        return;
    const text = channel;
    const embed = (0, settlementCard_1.buildSettlementCard)(opts.settlement);
    if (opts.settlement.statusCardMessageId) {
        const msg = await text.messages.fetch(opts.settlement.statusCardMessageId).catch(() => null);
        if (msg) {
            await msg.edit({ embeds: [embed] }).catch(() => null);
            if (!msg.pinned)
                await msg.pin().catch(() => null);
            return;
        }
    }
    const msg = await text.send({ embeds: [embed] }).catch(() => null);
    if (!msg)
        return;
    if (!msg.pinned)
        await msg.pin().catch(() => null);
    await opts.store.update(async (state) => {
        const s = state.guilds[opts.guild.id]?.settlements?.[opts.settlement.id];
        if (!s)
            return;
        s.statusCardMessageId = msg.id;
    });
}
async function handleMayorRequestButtons(opts) {
    const { interaction, store } = opts;
    if (!interaction.inCachedGuild())
        return;
    if (!interaction.customId.startsWith("mayorreq:"))
        return;
    const parts = interaction.customId.split(":");
    const action = parts[1];
    const requestId = parts.slice(2).join(":");
    if (!requestId)
        return;
    const gs = store.get().guilds[interaction.guildId];
    if (!canReview({ interaction, config: gs?.config })) {
        await interaction.reply({
            content: "You don't have permission to approve/deny mayor requests.",
            flags: v10_1.MessageFlags.Ephemeral,
        });
        return;
    }
    const guild = interaction.guild;
    const guildState = store.get().guilds[guild.id];
    if (!guildState) {
        await interaction.reply({ content: "Run `/setup init` first.", flags: v10_1.MessageFlags.Ephemeral });
        return;
    }
    const req = guildState.mayorRequests?.[requestId];
    if (!req) {
        await interaction.reply({ content: "Request not found (it may have been deleted).", flags: v10_1.MessageFlags.Ephemeral });
        return;
    }
    if (req.status !== "pending") {
        await interaction.reply({ content: `Request is already ${req.status}.`, flags: v10_1.MessageFlags.Ephemeral });
        return;
    }
    const settlement = findSettlement(guildState, req.settlementId);
    if (!settlement) {
        await interaction.reply({ content: "Settlement no longer exists.", flags: v10_1.MessageFlags.Ephemeral });
        return;
    }
    await interaction.deferUpdate();
    const now = Date.now();
    if (action === "deny") {
        await store.update(async (state) => {
            const r = state.guilds[guild.id]?.mayorRequests?.[requestId];
            if (!r)
                return;
            r.status = "denied";
            r.reviewedAtMs = now;
            r.reviewedByUserId = interaction.user.id;
        });
        await interaction.message.edit({
            content: `Status: **Denied** by <@${interaction.user.id}>.`,
            components: [disableReviewButtons(requestId)],
            allowedMentions: { parse: [] },
        });
        return;
    }
    if (action !== "approve")
        return;
    await setMayorRole({ guild, store, settlement, newMayorUserId: req.requesterUserId });
    const termEndMs = (0, mayorTerm_1.nextElectionTermEndMs)(guildState.config.timezone);
    await store.update(async (state) => {
        const gs = state.guilds[guild.id];
        if (!gs)
            return;
        const s = gs.settlements[settlement.id];
        if (!s)
            return;
        s.mayorUserId = req.requesterUserId;
        s.mayorGuildName = req.guildName?.trim() ? req.guildName.trim() : null;
        s.mayorSinceMs = now;
        s.mayorUntilMs = termEndMs;
        s.updatedAtMs = now;
        const r = gs.mayorRequests[requestId];
        if (r) {
            r.status = "approved";
            r.reviewedAtMs = now;
            r.reviewedByUserId = interaction.user.id;
        }
    });
    const announcementsChannelId = store.get().guilds[guild.id]?.config?.announcementsChannelId;
    if (announcementsChannelId) {
        const chan = await guild.channels.fetch(announcementsChannelId).catch(() => null);
        if (chan && chan.type === discord_js_1.ChannelType.GuildText) {
            const guildName = req.guildName?.trim();
            const guildLabel = guildName ? ` (Guild: **${guildName}**)` : "";
            await chan
                .send({
                content: `New mayor for **${settlement.name}**: <@${req.requesterUserId}>${guildLabel} (term ends <t:${Math.floor(termEndMs / 1000)}:D>).`,
                allowedMentions: { parse: [] },
            })
                .catch(() => null);
        }
    }
    const updatedSettlement = store.get().guilds[guild.id]?.settlements?.[settlement.id];
    if (updatedSettlement) {
        await upsertSettlementStatusCard({ guild, settlement: updatedSettlement, store });
    }
    await (0, overview_1.upsertGuildOverview)(guild, store);
    await (0, mayorDm_1.dmMayorWelcome)({ guild, store, mayorUserId: req.requesterUserId, settlementId: settlement.id });
    const aggregateRoleId = await (0, mayorAggregate_1.getOrCreateMayorAggregateRoleId)(store, guild);
    if (aggregateRoleId) {
        const member = await guild.members.fetch(req.requesterUserId).catch(() => null);
        if (member && !member.roles.cache.has(aggregateRoleId)) {
            await member.roles.add(aggregateRoleId).catch(() => null);
        }
    }
    await interaction.message.edit({
        content: `Status: **Approved** by <@${interaction.user.id}>.`,
        components: [disableReviewButtons(requestId)],
        allowedMentions: { parse: [] },
    });
}
