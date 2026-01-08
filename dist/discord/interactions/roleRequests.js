"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleRoleRequestButtons = handleRoleRequestButtons;
exports.handleRoleRequestModal = handleRoleRequestModal;
const discord_js_1 = require("discord.js");
const v10_1 = require("discord-api-types/v10");
const guildRoles_1 = require("../guildRoles");
const ids_1 = require("../../utils/ids");
function canReview(opts) {
    const { interaction, config } = opts;
    const member = interaction.member;
    const adminRoleId = config?.adminRoleId ?? null;
    const moderatorRoleId = config?.moderatorRoleId ?? null;
    const perms = interaction.memberPermissions;
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
function roleLabel(type) {
    return type === "guild_leader" ? "Guild Leader" : "Guild Officer";
}
function buildRoleRequestEmbed(opts) {
    return new discord_js_1.EmbedBuilder()
        .setTitle(`Role request: ${roleLabel(opts.type)}`)
        .setColor(0x9b59b6)
        .addFields({ name: "Request ID", value: opts.requestId, inline: true }, { name: "User", value: `<@${opts.requesterUserId}>`, inline: true }, { name: "Guild", value: opts.guildName || "-", inline: true }, { name: "Note", value: opts.note || "-" })
        .setFooter({ text: "Approve/Deny using the buttons below." });
}
function reviewButtons(requestId) {
    return new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.ButtonBuilder().setCustomId(`rolereq:approve:${requestId}`).setLabel("Approve").setStyle(discord_js_1.ButtonStyle.Success), new discord_js_1.ButtonBuilder().setCustomId(`rolereq:deny:${requestId}`).setLabel("Deny").setStyle(discord_js_1.ButtonStyle.Danger));
}
function disabledReviewButtons(requestId) {
    return new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.ButtonBuilder()
        .setCustomId(`rolereq:approve:${requestId}`)
        .setLabel("Approve")
        .setStyle(discord_js_1.ButtonStyle.Success)
        .setDisabled(true), new discord_js_1.ButtonBuilder()
        .setCustomId(`rolereq:deny:${requestId}`)
        .setLabel("Deny")
        .setStyle(discord_js_1.ButtonStyle.Danger)
        .setDisabled(true));
}
async function handleRoleRequestButtons(opts) {
    const { interaction, store } = opts;
    if (!interaction.inCachedGuild())
        return;
    if (!interaction.customId.startsWith("rolereq:"))
        return;
    const parts = interaction.customId.split(":");
    const action = parts[1];
    const tail = parts.slice(2).join(":");
    if (action === "open") {
        const type = tail === "guild_leader" || tail === "guild_officer" ? tail : null;
        if (!type)
            return;
        const modal = new discord_js_1.ModalBuilder().setCustomId(`rolereqmodal:${type}`).setTitle(`Request ${roleLabel(type)}`);
        const guildName = new discord_js_1.TextInputBuilder()
            .setCustomId("guild_name")
            .setLabel("In-game guild name")
            .setStyle(discord_js_1.TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(80);
        const note = new discord_js_1.TextInputBuilder()
            .setCustomId("note")
            .setLabel("Short note for moderators")
            .setStyle(discord_js_1.TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(600);
        modal.addComponents(new discord_js_1.ActionRowBuilder().addComponents(guildName), new discord_js_1.ActionRowBuilder().addComponents(note));
        await interaction.showModal(modal);
        return;
    }
    if (action !== "approve" && action !== "deny")
        return;
    const gs = store.get().guilds[interaction.guildId];
    if (!canReview({ interaction, config: gs?.config })) {
        await interaction.reply({ content: "You don't have permission to review these requests.", flags: v10_1.MessageFlags.Ephemeral });
        return;
    }
    const requestId = tail;
    const req = gs?.roleRequests?.[requestId];
    if (!req) {
        await interaction.reply({ content: "Request not found.", flags: v10_1.MessageFlags.Ephemeral });
        return;
    }
    if (req.status !== "pending") {
        await interaction.reply({ content: `Request is already ${req.status}.`, flags: v10_1.MessageFlags.Ephemeral });
        return;
    }
    await interaction.deferUpdate();
    const now = Date.now();
    if (action === "deny") {
        await store.update(async (state) => {
            const r = state.guilds[interaction.guildId]?.roleRequests?.[requestId];
            if (!r)
                return;
            r.status = "denied";
            r.reviewedAtMs = now;
            r.reviewedByUserId = interaction.user.id;
        });
        await interaction.message.edit({
            content: `Status: **Denied** by <@${interaction.user.id}>.`,
            components: [disabledReviewButtons(requestId)],
            allowedMentions: { parse: [] },
        });
        return;
    }
    const roleName = roleLabel(req.type);
    const role = interaction.guild.roles.cache.find((r) => r.name.toLowerCase() === roleName.toLowerCase()) ?? null;
    if (!role) {
        await interaction.followUp({
            content: `Missing role \`${roleName}\`. Run \`/setup init\` again.`,
            flags: v10_1.MessageFlags.Ephemeral,
        });
        return;
    }
    const member = await interaction.guild.members.fetch(req.requesterUserId).catch(() => null);
    if (member)
        await member.roles.add(role.id).catch(() => null);
    let guildRoleId = null;
    if (req.guildName) {
        try {
            const ensured = await (0, guildRoles_1.ensureGuildRoleForName)({
                guild: interaction.guild,
                store,
                name: req.guildName,
                requestedByUserId: req.requesterUserId,
            });
            guildRoleId = ensured.roleId;
        }
        catch {
            // fall through; handled below
        }
    }
    if (member && guildRoleId) {
        await member.roles.add(guildRoleId).catch(() => null);
    }
    await store.update(async (state) => {
        const r = state.guilds[interaction.guildId]?.roleRequests?.[requestId];
        if (!r)
            return;
        r.status = "approved";
        r.reviewedAtMs = now;
        r.reviewedByUserId = interaction.user.id;
    });
    await interaction.message.edit({
        content: `Status: **Approved** by <@${interaction.user.id}>.`,
        components: [disabledReviewButtons(requestId)],
        allowedMentions: { parse: [] },
    });
    if (guildRoleId && !member) {
        await interaction.followUp({
            content: `Guild role created: <@&${guildRoleId}> (assign it manually to <@${req.requesterUserId}>; user not in server).`,
            flags: v10_1.MessageFlags.Ephemeral,
        });
    }
    else if (req.guildName && !guildRoleId) {
        await interaction.followUp({
            content: `Warning: could not create/find the guild role for **${req.guildName}**. Check bot permissions and try again.`,
            flags: v10_1.MessageFlags.Ephemeral,
        });
    }
}
async function handleRoleRequestModal(opts) {
    const { interaction, store } = opts;
    if (!interaction.inCachedGuild())
        return;
    if (!interaction.customId.startsWith("rolereqmodal:"))
        return;
    const type = interaction.customId.split(":")[1];
    if (type !== "guild_leader" && type !== "guild_officer")
        return;
    const gs = store.get().guilds[interaction.guildId];
    if (!gs) {
        await interaction.reply({
            content: "Server is not initialized. Ask an admin to run `/setup init`.",
            flags: v10_1.MessageFlags.Ephemeral,
        });
        return;
    }
    const guildName = interaction.fields.getTextInputValue("guild_name").trim();
    const note = interaction.fields.getTextInputValue("note").trim();
    if (!guildName || !note) {
        await interaction.reply({ content: "Guild name and note are required.", flags: v10_1.MessageFlags.Ephemeral });
        return;
    }
    const requestId = (0, ids_1.newId)("rolereq");
    const createdAtMs = Date.now();
    const req = {
        id: requestId,
        type,
        requesterUserId: interaction.user.id,
        guildName,
        note,
        status: "pending",
        createdAtMs,
        reviewedAtMs: null,
        reviewedByUserId: null,
    };
    await store.update(async (state) => {
        const g = state.guilds[interaction.guildId];
        if (!g)
            return;
        g.roleRequests[requestId] = req;
    });
    const requestsChannelId = store.get().guilds[interaction.guildId]?.config?.requestsChannelId;
    if (requestsChannelId) {
        const chan = await interaction.guild.channels.fetch(requestsChannelId).catch(() => null);
        if (chan && chan.type === discord_js_1.ChannelType.GuildText) {
            const config = store.get().guilds[interaction.guildId]?.config;
            const modPingRoleIds = Array.from(new Set([
                ...(config?.moderatorRoleId ? [config.moderatorRoleId] : []),
                ...(config?.adminRoleId ? [config.adminRoleId] : []),
            ].filter(Boolean)));
            const pingContent = modPingRoleIds.length ? modPingRoleIds.map((id) => `<@&${id}>`).join(" ") : undefined;
            await chan
                .send({
                content: pingContent,
                embeds: [buildRoleRequestEmbed({ requestId, type, requesterUserId: interaction.user.id, guildName, note })],
                components: [reviewButtons(requestId)],
                allowedMentions: modPingRoleIds.length ? { roles: modPingRoleIds } : { parse: [] },
            })
                .catch(() => null);
        }
    }
    await interaction.reply({
        content: `Request submitted (**${requestId}**). A moderator will review it.`,
        flags: v10_1.MessageFlags.Ephemeral,
    });
}
