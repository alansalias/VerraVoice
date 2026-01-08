"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleMayor = void 0;
const discord_js_1 = require("discord.js");
const v10_1 = require("discord-api-types/v10");
const ids_1 = require("../../utils/ids");
const settlementCard_1 = require("../embeds/settlementCard");
const overview_1 = require("../overview");
const permissions_1 = require("../permissions");
const moderationRoles_1 = require("../moderationRoles");
const mayorAggregate_1 = require("../mayorAggregate");
const mayorDm_1 = require("../mayorDm");
const mayorTerm_1 = require("../mayorTerm");
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
async function updateSettlementCard(interaction, settlement) {
    if (!settlement.channelId)
        return;
    const channel = await interaction.guild.channels.fetch(settlement.channelId).catch(() => null);
    if (!channel || channel.type !== discord_js_1.ChannelType.GuildText)
        return;
    const text = channel;
    const embed = (0, settlementCard_1.buildSettlementCard)(settlement);
    if (settlement.statusCardMessageId) {
        const msg = await text.messages.fetch(settlement.statusCardMessageId).catch(() => null);
        if (msg) {
            await msg.edit({ embeds: [embed] });
            if (!msg.pinned)
                await msg.pin().catch(() => null);
            return;
        }
    }
    const msg = await text.send({ embeds: [embed] });
    if (!msg.pinned)
        await msg.pin().catch(() => null);
    settlement.statusCardMessageId = msg.id;
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
        if (newMember)
            await newMember.roles.add(roleId).catch(() => null);
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
function buildReviewButtons(requestId) {
    return new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.ButtonBuilder()
        .setCustomId(`mayorreq:approve:${requestId}`)
        .setLabel("Approve")
        .setStyle(discord_js_1.ButtonStyle.Success), new discord_js_1.ButtonBuilder()
        .setCustomId(`mayorreq:deny:${requestId}`)
        .setLabel("Deny")
        .setStyle(discord_js_1.ButtonStyle.Danger));
}
function buildMayorRequestEmbed(opts) {
    return new discord_js_1.EmbedBuilder()
        .setTitle(`Mayor claim: ${opts.settlementName}`)
        .setColor(0xf1c40f)
        .addFields({ name: "Request ID", value: opts.requestId, inline: true }, { name: "User", value: `<@${opts.requesterUserId}>`, inline: true }, { name: "Guild", value: opts.guildName, inline: true }, { name: "Note", value: opts.note })
        .setImage(opts.proofUrl)
        .setFooter({ text: "Approve/Deny using the buttons below." });
}
const handleMayor = async ({ interaction, store }) => {
    if (interaction.commandName !== "mayor")
        return;
    (0, permissions_1.requireGuild)(interaction);
    const sub = interaction.options.getSubcommand();
    const guild = interaction.guild;
    const guildState = store.get().guilds[guild.id];
    if (!guildState) {
        await interaction.reply({ content: "Run `/setup init` first.", flags: v10_1.MessageFlags.Ephemeral });
        return;
    }
    if (sub === "claim") {
        const settlementInput = interaction.options.getString("settlement", true);
        const settlement = findSettlement(guildState, settlementInput);
        if (!settlement) {
            await interaction.reply({ content: "Settlement not found.", flags: v10_1.MessageFlags.Ephemeral });
            return;
        }
        const proof = interaction.options.getAttachment("proof", true);
        const guildName = interaction.options.getString("guild_name", true).trim();
        const note = interaction.options.getString("note", true).trim();
        const isImage = (proof.contentType && proof.contentType.startsWith("image/")) ||
            /\.(png|jpe?g|gif|webp)$/i.test(proof.url);
        if (!isImage) {
            await interaction.reply({
                content: "Proof must be an image upload (png/jpg/gif/webp).",
                flags: v10_1.MessageFlags.Ephemeral,
            });
            return;
        }
        if (!guildName) {
            await interaction.reply({ content: "Guild name is required.", flags: v10_1.MessageFlags.Ephemeral });
            return;
        }
        if (!note) {
            await interaction.reply({ content: "Note is required.", flags: v10_1.MessageFlags.Ephemeral });
            return;
        }
        if (note.length > 600) {
            await interaction.reply({ content: "Note is too long (max ~600 chars).", flags: v10_1.MessageFlags.Ephemeral });
            return;
        }
        const requestId = (0, ids_1.newId)("mayorreq");
        const createdAtMs = Date.now();
        await store.update(async (state) => {
            const gs = state.guilds[guild.id];
            if (!gs)
                return;
            const req = {
                id: requestId,
                settlementId: settlement.id,
                requesterUserId: interaction.user.id,
                guildName,
                note,
                proofUrl: proof.url,
                proofFilename: proof.name ?? null,
                proofContentType: proof.contentType ?? null,
                proofSize: proof.size ?? null,
                status: "pending",
                createdAtMs,
                reviewedAtMs: null,
                reviewedByUserId: null,
            };
            gs.mayorRequests[requestId] = req;
        });
        const requestsChannelId = store.get().guilds[guild.id]?.config?.requestsChannelId;
        if (!requestsChannelId) {
            await interaction.reply({
                content: "Requests channel is not configured. Run `/setup init` again.",
                flags: v10_1.MessageFlags.Ephemeral,
            });
            return;
        }
        const chan = await guild.channels.fetch(requestsChannelId).catch(() => null);
        if (!chan || chan.type !== discord_js_1.ChannelType.GuildText) {
            await interaction.reply({
                content: "Requests channel is missing. Run `/setup init` again.",
                flags: v10_1.MessageFlags.Ephemeral,
            });
            return;
        }
        const config = store.get().guilds[guild.id]?.config;
        const modPingRoleIds = Array.from(new Set([
            ...(config?.moderatorRoleId ? [config.moderatorRoleId] : []),
            ...(config?.adminRoleId ? [config.adminRoleId] : []),
            ...(0, moderationRoles_1.moderatorRoleIds)(guild),
        ].filter(Boolean)));
        const pingContent = modPingRoleIds.length ? modPingRoleIds.map((id) => `<@&${id}>`).join(" ") : undefined;
        await chan
            .send({
            content: pingContent,
            embeds: [
                buildMayorRequestEmbed({
                    requestId,
                    settlementName: settlement.name,
                    requesterUserId: interaction.user.id,
                    guildName,
                    note,
                    proofUrl: proof.url,
                }),
            ],
            components: [buildReviewButtons(requestId)],
            allowedMentions: modPingRoleIds.length ? { roles: modPingRoleIds } : { parse: [] },
        })
            .catch(() => null);
        await interaction.reply({
            content: `Request submitted (**${requestId}**). A moderator will review it.`,
            flags: v10_1.MessageFlags.Ephemeral,
        });
        return;
    }
    if (sub === "approve" || sub === "deny") {
        if (!(0, permissions_1.canReviewMayorRequests)(interaction)) {
            await interaction.reply({
                content: "You need moderation permissions (Manage Server / Moderate Members / Manage Roles) to review requests.",
                flags: v10_1.MessageFlags.Ephemeral,
            });
            return;
        }
        const requestId = interaction.options.getString("request_id", true);
        const req = store.get().guilds[guild.id]?.mayorRequests?.[requestId];
        if (!req) {
            await interaction.reply({ content: "Request not found.", flags: v10_1.MessageFlags.Ephemeral });
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
        if (sub === "deny") {
            await store.update(async (state) => {
                const r = state.guilds[guild.id]?.mayorRequests?.[requestId];
                if (!r)
                    return;
                r.status = "denied";
                r.reviewedAtMs = Date.now();
                r.reviewedByUserId = interaction.user.id;
            });
            await interaction.reply({ content: `Denied request **${requestId}**.`, flags: v10_1.MessageFlags.Ephemeral });
            return;
        }
        await setMayorRole({ guild, store, settlement, newMayorUserId: req.requesterUserId });
        const now = Date.now();
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
        const updated = store.get().guilds[guild.id]?.settlements?.[settlement.id];
        if (updated)
            await updateSettlementCard(interaction, updated);
        await (0, overview_1.upsertGuildOverview)(guild, store);
        await (0, mayorDm_1.dmMayorWelcome)({ guild, store, mayorUserId: req.requesterUserId, settlementId: settlement.id });
        const aggregateRoleId = await (0, mayorAggregate_1.getOrCreateMayorAggregateRoleId)(store, guild);
        if (aggregateRoleId) {
            const newMayorMember = await guild.members.fetch(req.requesterUserId).catch(() => null);
            if (newMayorMember && !newMayorMember.roles.cache.has(aggregateRoleId)) {
                await newMayorMember.roles.add(aggregateRoleId).catch(() => null);
            }
        }
        const announcementsChannelId = store.get().guilds[guild.id]?.config?.announcementsChannelId;
        if (announcementsChannelId) {
            const chan = await guild.channels.fetch(announcementsChannelId).catch(() => null);
            if (chan && chan.type === discord_js_1.ChannelType.GuildText) {
                const guildName = updated?.mayorGuildName?.trim();
                const guildLabel = guildName ? ` (Guild: **${guildName}**)` : "";
                await chan.send(`New mayor for **${settlement.name}**: <@${req.requesterUserId}>${guildLabel} (term ends <t:${Math.floor(termEndMs / 1000)}:D>).`);
            }
        }
        await interaction.reply({
            content: `Approved request **${requestId}** and assigned mayor role.`,
            flags: v10_1.MessageFlags.Ephemeral,
        });
        return;
    }
    if (sub === "assign") {
        if (!(0, permissions_1.canReviewMayorRequests)(interaction)) {
            await interaction.reply({
                content: "You need moderation permissions (Manage Server / Moderate Members / Manage Roles) to assign mayors.",
                flags: v10_1.MessageFlags.Ephemeral,
            });
            return;
        }
        const settlementInput = interaction.options.getString("settlement", true);
        const user = interaction.options.getUser("user", true);
        const settlement = findSettlement(guildState, settlementInput);
        if (!settlement) {
            await interaction.reply({ content: "Settlement not found.", flags: v10_1.MessageFlags.Ephemeral });
            return;
        }
        await setMayorRole({ guild, store, settlement, newMayorUserId: user.id });
        const now = Date.now();
        const termEndMs = (0, mayorTerm_1.nextElectionTermEndMs)(guildState.config.timezone);
        await store.update(async (state) => {
            const s = state.guilds[guild.id]?.settlements?.[settlement.id];
            if (!s)
                return;
            s.mayorUserId = user.id;
            s.mayorGuildName = null;
            s.mayorSinceMs = now;
            s.mayorUntilMs = termEndMs;
            s.updatedAtMs = now;
        });
        const updated = store.get().guilds[guild.id]?.settlements?.[settlement.id];
        if (updated)
            await updateSettlementCard(interaction, updated);
        await (0, overview_1.upsertGuildOverview)(guild, store);
        await (0, mayorDm_1.dmMayorWelcome)({ guild, store, mayorUserId: user.id, settlementId: settlement.id });
        const aggregateRoleId = await (0, mayorAggregate_1.getOrCreateMayorAggregateRoleId)(store, guild);
        if (aggregateRoleId) {
            const member = await guild.members.fetch(user.id).catch(() => null);
            if (member && !member.roles.cache.has(aggregateRoleId)) {
                await member.roles.add(aggregateRoleId).catch(() => null);
            }
        }
        await interaction.reply({
            content: `Mayor for **${settlement.name}** set to <@${user.id}>.`,
            flags: v10_1.MessageFlags.Ephemeral,
        });
        return;
    }
    if (sub === "clear") {
        if (!(0, permissions_1.canReviewMayorRequests)(interaction)) {
            await interaction.reply({
                content: "You need moderation permissions (Manage Server / Moderate Members / Manage Roles) to clear mayors.",
                flags: v10_1.MessageFlags.Ephemeral,
            });
            return;
        }
        const settlementInput = interaction.options.getString("settlement", true);
        const settlement = findSettlement(guildState, settlementInput);
        if (!settlement) {
            await interaction.reply({ content: "Settlement not found.", flags: v10_1.MessageFlags.Ephemeral });
            return;
        }
        await setMayorRole({ guild, store, settlement, newMayorUserId: null });
        await store.update(async (state) => {
            const s = state.guilds[guild.id]?.settlements?.[settlement.id];
            if (!s)
                return;
            s.mayorUserId = null;
            s.mayorGuildName = null;
            s.mayorSinceMs = null;
            s.mayorUntilMs = null;
            s.updatedAtMs = Date.now();
        });
        const updated = store.get().guilds[guild.id]?.settlements?.[settlement.id];
        if (updated)
            await updateSettlementCard(interaction, updated);
        await (0, overview_1.upsertGuildOverview)(guild, store);
        await interaction.reply({ content: `Cleared mayor for **${settlement.name}**.`, flags: v10_1.MessageFlags.Ephemeral });
        return;
    }
};
exports.handleMayor = handleMayor;
