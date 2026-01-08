"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.upsertGuildControlsPanel = upsertGuildControlsPanel;
exports.ensureGuildRoleForName = ensureGuildRoleForName;
exports.handleGuildRoleButtons = handleGuildRoleButtons;
exports.handleGuildRoleModals = handleGuildRoleModals;
const discord_js_1 = require("discord.js");
const v10_1 = require("discord-api-types/v10");
function buildGuildControlsEmbed() {
    return new discord_js_1.EmbedBuilder()
        .setTitle("Guild controls")
        .setColor(0x1f8b4c)
        .setDescription([
        "Tools for Guild Leaders/Officers to manage their guild role.",
        "",
        "- Use `/ginvite user:<member> guild:<name>` to give your guild role to members.",
        "- Abuse (handing out guild roles broadly) can lead to moderation action.",
        "- Buttons below let you rename or delete your guild role.",
        "",
        "Requirements: you must have the server `Guild Leader` or `Guild Officer` role **and** your guild's role.",
    ].join("\n"));
}
function guildControlsComponents() {
    return [
        new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.ButtonBuilder().setCustomId("guildrole:rename").setLabel("Change guild name").setStyle(discord_js_1.ButtonStyle.Primary), new discord_js_1.ButtonBuilder().setCustomId("guildrole:delete").setLabel("Delete guild").setStyle(discord_js_1.ButtonStyle.Danger)),
    ];
}
async function upsertGuildControlsPanel(opts) {
    const { guild, store } = opts;
    const gs = store.get().guilds[guild.id];
    const channelId = gs?.config.guildManagementChannelId;
    if (!channelId)
        return;
    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (!channel || channel.type !== discord_js_1.ChannelType.GuildText)
        return;
    const text = channel;
    const embed = buildGuildControlsEmbed();
    const messageId = gs?.config.guildManagementMessageId ?? null;
    if (messageId) {
        const msg = await text.messages.fetch(messageId).catch(() => null);
        if (msg) {
            await msg.edit({ embeds: [embed], components: guildControlsComponents() }).catch(() => null);
            return;
        }
    }
    const sent = await text.send({ embeds: [embed], components: guildControlsComponents() }).catch(() => null);
    if (!sent)
        return;
    await store.update(async (state) => {
        const g = state.guilds[guild.id];
        if (!g)
            return;
        g.config.guildManagementMessageId = sent.id;
    });
}
async function ensureGuildRoleForName(opts) {
    const { guild, store } = opts;
    const name = opts.name.trim();
    const lower = name.toLowerCase();
    const gs = store.get().guilds[guild.id];
    const existingEntry = gs?.guildRoles ? Object.values(gs.guildRoles).find((g) => g.name.toLowerCase() === lower) ?? null : null;
    const fromStoreRoleId = existingEntry?.roleId ?? null;
    let role = (fromStoreRoleId ? await guild.roles.fetch(fromStoreRoleId).catch(() => null) : null) ??
        guild.roles.cache.find((r) => r.name.toLowerCase() === lower) ??
        null;
    if (role) {
        if (role.name !== name) {
            await role.setName(name, "VerraVoice: ensure guild role name").catch(() => null);
        }
        if (role.mentionable) {
            await role.setMentionable(false, "VerraVoice: guild role should not be mentionable").catch(() => null);
        }
    }
    else {
        role = await guild.roles.create({ name, mentionable: false }).catch(() => null);
    }
    if (!role)
        throw new Error(`Failed to ensure guild role "${name}". Check bot permissions.`);
    const createdAtMs = existingEntry?.createdAtMs ?? Date.now();
    const renamedAtMs = existingEntry ? (existingEntry.name === name ? existingEntry.renamedAtMs : Date.now()) : null;
    await store.update(async (state) => {
        const g = state.guilds[guild.id];
        if (!g)
            return;
        g.guildRoles ??= {};
        // Remove stale entry keyed by old role id if the role id changed.
        if (existingEntry && existingEntry.roleId !== role.id) {
            delete g.guildRoles[existingEntry.roleId];
        }
        g.guildRoles[role.id] = {
            roleId: role.id,
            name,
            createdByUserId: existingEntry?.createdByUserId ?? opts.requestedByUserId,
            createdAtMs,
            renamedAtMs,
        };
    });
    return { roleId: role.id, name };
}
function findGuildEntryByName(gs, name) {
    if (!gs)
        return null;
    const lower = name.toLowerCase();
    return Object.values(gs.guildRoles ?? {}).find((g) => g.name.toLowerCase() === lower) ?? null;
}
function memberHasRole(member, roleId) {
    return !!roleId && member.roles.cache.has(roleId);
}
async function handleGuildRoleButtons(opts) {
    const { interaction, store } = opts;
    if (!interaction.inCachedGuild())
        return;
    if (!interaction.customId.startsWith("guildrole:"))
        return;
    const action = interaction.customId.split(":")[1];
    if (action !== "delete" && action !== "rename")
        return;
    const modal = new discord_js_1.ModalBuilder().setCustomId(`guildrolemodal:${action}`);
    const guildName = new discord_js_1.TextInputBuilder()
        .setCustomId("guild_name")
        .setLabel("Guild name")
        .setStyle(discord_js_1.TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(80);
    if (action === "delete") {
        const confirm = new discord_js_1.TextInputBuilder()
            .setCustomId("confirm")
            .setLabel('Type "DELETE" to confirm')
            .setStyle(discord_js_1.TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(10);
        modal.setTitle("Delete guild role").addComponents(new discord_js_1.ActionRowBuilder().addComponents(guildName), new discord_js_1.ActionRowBuilder().addComponents(confirm));
    }
    else {
        const newName = new discord_js_1.TextInputBuilder()
            .setCustomId("new_name")
            .setLabel("New guild name")
            .setStyle(discord_js_1.TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(80);
        modal.setTitle("Change guild name").addComponents(new discord_js_1.ActionRowBuilder().addComponents(guildName), new discord_js_1.ActionRowBuilder().addComponents(newName));
    }
    await interaction.showModal(modal);
}
async function handleGuildRoleModals(opts) {
    const { interaction, store } = opts;
    if (!interaction.inCachedGuild())
        return;
    if (!interaction.customId.startsWith("guildrolemodal:"))
        return;
    const action = interaction.customId.split(":")[1];
    if (action !== "delete" && action !== "rename")
        return;
    const gs = store.get().guilds[interaction.guildId];
    if (!gs) {
        await interaction.reply({
            content: "Server is not initialized. Ask an admin to run `/setup init`.",
            flags: v10_1.MessageFlags.Ephemeral,
        });
        return;
    }
    const config = gs.config;
    const leaderRoleId = config.guildLeaderRoleId;
    const officerRoleId = config.guildOfficerRoleId;
    const guildName = interaction.fields.getTextInputValue("guild_name").trim();
    if (!guildName) {
        await interaction.reply({ content: "Guild name is required.", flags: v10_1.MessageFlags.Ephemeral });
        return;
    }
    const entry = findGuildEntryByName(gs, guildName);
    const member = interaction.member;
    const hasGuildRole = entry ? memberHasRole(member, entry.roleId) : false;
    const hasLeader = memberHasRole(member, leaderRoleId);
    const hasOfficer = memberHasRole(member, officerRoleId);
    if (!entry) {
        await interaction.reply({
            content: `No guild role found for **${guildName}**. If this is a new guild, request approval first.`,
            flags: v10_1.MessageFlags.Ephemeral,
        });
        return;
    }
    if (!hasGuildRole) {
        await interaction.reply({
            content: "You must have your guild's role to manage it.",
            flags: v10_1.MessageFlags.Ephemeral,
        });
        return;
    }
    if (action === "delete") {
        if (!hasLeader) {
            await interaction.reply({
                content: "Only Guild Leaders with this guild's role can delete the guild role.",
                flags: v10_1.MessageFlags.Ephemeral,
            });
            return;
        }
        const confirm = interaction.fields.getTextInputValue("confirm").trim();
        if (confirm !== "DELETE") {
            await interaction.reply({ content: 'Deletion cancelled (type "DELETE" to confirm).', flags: v10_1.MessageFlags.Ephemeral });
            return;
        }
        const role = await interaction.guild.roles.fetch(entry.roleId).catch(() => null);
        if (role) {
            await role.delete("VerraVoice: guild role deleted by guild leader").catch(() => null);
        }
        await store.update(async (state) => {
            const g = state.guilds[interaction.guildId];
            if (!g?.guildRoles)
                return;
            delete g.guildRoles[entry.roleId];
        });
        await interaction.reply({
            content: `Guild role **${entry.name}** deleted.`,
            flags: v10_1.MessageFlags.Ephemeral,
        });
        return;
    }
    // rename
    if (!hasLeader && !hasOfficer) {
        await interaction.reply({
            content: "Only Guild Leaders or Guild Officers with this guild's role can rename it.",
            flags: v10_1.MessageFlags.Ephemeral,
        });
        return;
    }
    const newName = interaction.fields.getTextInputValue("new_name").trim();
    if (!newName) {
        await interaction.reply({ content: "New name is required.", flags: v10_1.MessageFlags.Ephemeral });
        return;
    }
    const targetRole = await interaction.guild.roles.fetch(entry.roleId).catch(() => null);
    if (!targetRole) {
        await interaction.reply({
            content: "Guild role no longer exists. Request approval again or ask staff to recreate it.",
            flags: v10_1.MessageFlags.Ephemeral,
        });
        return;
    }
    const lower = newName.toLowerCase();
    const conflict = Object.values(gs.guildRoles ?? {}).find((g) => g.roleId !== entry.roleId && g.name.toLowerCase() === lower) ?? null;
    if (conflict) {
        await interaction.reply({
            content: `A guild role named **${newName}** already exists.`,
            flags: v10_1.MessageFlags.Ephemeral,
        });
        return;
    }
    await targetRole.setName(newName, `VerraVoice: rename guild role from ${entry.name}`).catch(() => null);
    if (targetRole.mentionable) {
        await targetRole.setMentionable(false, "VerraVoice: guild role should not be mentionable").catch(() => null);
    }
    await store.update(async (state) => {
        const g = state.guilds[interaction.guildId];
        if (!g)
            return;
        g.guildRoles ??= {};
        g.guildRoles[entry.roleId] = {
            roleId: entry.roleId,
            name: newName,
            createdByUserId: entry.createdByUserId,
            createdAtMs: entry.createdAtMs,
            renamedAtMs: Date.now(),
        };
    });
    await interaction.reply({
        content: `Renamed guild role to **${newName}**.`,
        flags: v10_1.MessageFlags.Ephemeral,
    });
}
