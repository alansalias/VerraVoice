"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mayorDashboardComponents = mayorDashboardComponents;
exports.handleMayorDashboardButtons = handleMayorDashboardButtons;
exports.handleMayorDashboardMenus = handleMayorDashboardMenus;
exports.handleMayorDashboardModal = handleMayorDashboardModal;
const discord_js_1 = require("discord.js");
const luxon_1 = require("luxon");
const v10_1 = require("discord-api-types/v10");
const schema_1 = require("../../state/schema");
const ids_1 = require("../../utils/ids");
const settlementCard_1 = require("../embeds/settlementCard");
const tiers_1 = require("../tiers");
const overview_1 = require("../overview");
const mayorAggregate_1 = require("../mayorAggregate");
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
function parseYesNo(input, defaultValue) {
    const raw = (input ?? "").trim().toLowerCase();
    if (!raw)
        return defaultValue;
    if (["y", "yes", "true", "1"].includes(raw))
        return true;
    if (["n", "no", "false", "0"].includes(raw))
        return false;
    return defaultValue;
}
function findSettlement(guildState, input) {
    const byId = guildState?.settlements?.[input];
    if (byId)
        return byId;
    const lower = input.toLowerCase().trim();
    for (const settlement of Object.values(guildState?.settlements ?? {})) {
        if (settlement.name.toLowerCase() === lower)
            return settlement;
    }
    return null;
}
function isAdminLike(interaction) {
    const perms = interaction.memberPermissions;
    if (!perms)
        return false;
    return perms.has(discord_js_1.PermissionFlagsBits.Administrator) || perms.has(discord_js_1.PermissionFlagsBits.ManageGuild);
}
function manageableSettlements(gs, member, admin) {
    const settlements = Object.values(gs?.settlements ?? {});
    if (admin)
        return settlements;
    return settlements.filter((s) => s.mayorRoleId && member.roles.cache.has(s.mayorRoleId));
}
function settlementSelectRow(opts) {
    const menu = new discord_js_1.StringSelectMenuBuilder()
        .setCustomId(opts.customId)
        .setPlaceholder("Select settlement")
        .setMinValues(1)
        .setMaxValues(1);
    for (const s of opts.settlements.slice(0, 25)) {
        menu.addOptions(new discord_js_1.StringSelectMenuOptionBuilder().setLabel(s.name).setValue(s.id));
    }
    return new discord_js_1.ActionRowBuilder().addComponents(menu);
}
function modalId(action, settlementId) {
    return `mayordashmodal:${action}:${settlementId}`;
}
function mayorDashboardComponents() {
    const row1 = new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.ButtonBuilder().setCustomId("mayordash:status").setLabel("Update Status").setStyle(discord_js_1.ButtonStyle.Primary), new discord_js_1.ButtonBuilder().setCustomId("mayordash:tier").setLabel("Set Tier").setStyle(discord_js_1.ButtonStyle.Secondary), new discord_js_1.ButtonBuilder().setCustomId("mayordash:announce").setLabel("Announce").setStyle(discord_js_1.ButtonStyle.Success));
    const row2 = new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.ButtonBuilder().setCustomId("mayordash:election").setLabel("Set Election").setStyle(discord_js_1.ButtonStyle.Primary), new discord_js_1.ButtonBuilder().setCustomId("mayordash:war").setLabel("Declare War").setStyle(discord_js_1.ButtonStyle.Danger), new discord_js_1.ButtonBuilder().setCustomId("mayordash:siege").setLabel("Declare Siege").setStyle(discord_js_1.ButtonStyle.Danger), new discord_js_1.ButtonBuilder().setCustomId("mayordash:destroyed").setLabel("Declare Destroyed").setStyle(discord_js_1.ButtonStyle.Secondary));
    return [row1, row2];
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
async function ensureCanAnnounce(gs, guild) {
    const channelId = gs?.config?.announcementsChannelId ?? null;
    if (!channelId)
        return null;
    const chan = await guild.channels.fetch(channelId).catch(() => null);
    if (!chan || chan.type !== discord_js_1.ChannelType.GuildText)
        return null;
    return chan;
}
async function handleMayorDashboardButtons(opts) {
    const { interaction, store } = opts;
    if (!interaction.inCachedGuild())
        return;
    if (!interaction.customId.startsWith("mayordash:"))
        return;
    const action = interaction.customId.split(":")[1] ?? "";
    const gs = store.get().guilds[interaction.guildId];
    if (!gs) {
        await interaction.reply({
            content: "Server is not initialized. Ask an admin to run `/setup init`.",
            flags: v10_1.MessageFlags.Ephemeral,
        });
        return;
    }
    const admin = isAdminLike(interaction);
    const available = manageableSettlements(gs, interaction.member, admin).sort((a, b) => a.name.localeCompare(b.name));
    if (!available.length) {
        await interaction.reply({
            content: "You don't have any mayor settlements assigned in this server.",
            flags: v10_1.MessageFlags.Ephemeral,
        });
        return;
    }
    if (available.length === 1) {
        const settlementId = available[0].id;
        await showModalForAction(interaction, action, settlementId, store);
        return;
    }
    await interaction.reply({
        content: "Select which settlement you want to manage:",
        components: [settlementSelectRow({ customId: `mayordashsel:${action}`, settlements: available })],
        flags: v10_1.MessageFlags.Ephemeral,
    });
}
async function handleMayorDashboardMenus(opts) {
    const { interaction, store } = opts;
    if (!interaction.inCachedGuild())
        return;
    if (!interaction.customId.startsWith("mayordashsel:"))
        return;
    const action = interaction.customId.split(":")[1] ?? "";
    const settlementId = interaction.values[0] ?? "";
    if (!settlementId)
        return;
    await showModalForAction(interaction, action, settlementId, store);
}
async function showModalForAction(interaction, action, settlementId, store) {
    const gs = store.get().guilds[interaction.guildId];
    const settlement = gs?.settlements?.[settlementId];
    if (!gs || !settlement) {
        await interaction.reply({ content: "Settlement not found.", flags: v10_1.MessageFlags.Ephemeral }).catch(() => null);
        return;
    }
    const titleBase = settlement.name.length > 40 ? settlement.name.slice(0, 40) : settlement.name;
    const timezone = gs.config.timezone || "UTC";
    if (action === "status") {
        const modal = new discord_js_1.ModalBuilder().setCustomId(modalId(action, settlementId)).setTitle(`Update Status - ${titleBase}`);
        const buildings = new discord_js_1.TextInputBuilder()
            .setCustomId("buildings")
            .setLabel("Buildings (optional)")
            .setStyle(discord_js_1.TextInputStyle.Paragraph)
            .setRequired(false)
            .setMaxLength(900);
        const buyOrders = new discord_js_1.TextInputBuilder()
            .setCustomId("buy_orders")
            .setLabel("Buy orders (optional)")
            .setStyle(discord_js_1.TextInputStyle.Paragraph)
            .setRequired(false)
            .setMaxLength(900);
        const notes = new discord_js_1.TextInputBuilder()
            .setCustomId("notes")
            .setLabel("Notes (optional)")
            .setStyle(discord_js_1.TextInputStyle.Paragraph)
            .setRequired(false)
            .setMaxLength(900);
        modal.addComponents(new discord_js_1.ActionRowBuilder().addComponents(buildings), new discord_js_1.ActionRowBuilder().addComponents(buyOrders), new discord_js_1.ActionRowBuilder().addComponents(notes));
        await interaction.showModal(modal);
        return;
    }
    if (action === "tier") {
        const modal = new discord_js_1.ModalBuilder().setCustomId(modalId(action, settlementId)).setTitle(`Set Tier - ${titleBase}`);
        const tier = new discord_js_1.TextInputBuilder()
            .setCustomId("tier")
            .setLabel("Tier (0-5)")
            .setStyle(discord_js_1.TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(1);
        modal.addComponents(new discord_js_1.ActionRowBuilder().addComponents(tier));
        await interaction.showModal(modal);
        return;
    }
    if (action === "announce") {
        const modal = new discord_js_1.ModalBuilder().setCustomId(modalId(action, settlementId)).setTitle(`Announcement - ${titleBase}`);
        const message = new discord_js_1.TextInputBuilder()
            .setCustomId("message")
            .setLabel("Announcement message")
            .setStyle(discord_js_1.TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(1500);
        const ping = new discord_js_1.TextInputBuilder()
            .setCustomId("ping")
            .setLabel("Ping citizens? (yes/no, default yes)")
            .setStyle(discord_js_1.TextInputStyle.Short)
            .setRequired(false)
            .setMaxLength(3);
        modal.addComponents(new discord_js_1.ActionRowBuilder().addComponents(message), new discord_js_1.ActionRowBuilder().addComponents(ping));
        await interaction.showModal(modal);
        return;
    }
    if (action === "election") {
        const modal = new discord_js_1.ModalBuilder().setCustomId(modalId(action, settlementId)).setTitle(`Election Schedule - ${titleBase}`);
        const reg = new discord_js_1.TextInputBuilder()
            .setCustomId("registration_start")
            .setLabel(`Registration start (YYYY-MM-DD HH:mm, 24h, ${timezone})`)
            .setStyle(discord_js_1.TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(25);
        const voteStart = new discord_js_1.TextInputBuilder()
            .setCustomId("voting_start")
            .setLabel(`Voting start (YYYY-MM-DD HH:mm, 24h, ${timezone})`)
            .setStyle(discord_js_1.TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(25);
        const voteEnd = new discord_js_1.TextInputBuilder()
            .setCustomId("voting_end")
            .setLabel(`Voting end (YYYY-MM-DD HH:mm, 24h, ${timezone})`)
            .setStyle(discord_js_1.TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(25);
        modal.addComponents(new discord_js_1.ActionRowBuilder().addComponents(reg), new discord_js_1.ActionRowBuilder().addComponents(voteStart), new discord_js_1.ActionRowBuilder().addComponents(voteEnd));
        await interaction.showModal(modal);
        return;
    }
    if (action === "war" || action === "siege") {
        const kindLabel = action === "siege" ? "Siege" : "War";
        const modal = new discord_js_1.ModalBuilder().setCustomId(modalId(action, settlementId)).setTitle(`Declare ${kindLabel} - ${titleBase}`);
        const defender = new discord_js_1.TextInputBuilder()
            .setCustomId("defender")
            .setLabel("Defender settlement name")
            .setStyle(discord_js_1.TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(64);
        const startsAt = new discord_js_1.TextInputBuilder()
            .setCustomId("starts_at")
            .setLabel(`${kindLabel} starts at (YYYY-MM-DD HH:mm, 24h, ${timezone})`)
            .setStyle(discord_js_1.TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(25);
        const title = new discord_js_1.TextInputBuilder()
            .setCustomId("title")
            .setLabel("Short title")
            .setStyle(discord_js_1.TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(80);
        const description = new discord_js_1.TextInputBuilder()
            .setCustomId("description")
            .setLabel("Optional description/details")
            .setStyle(discord_js_1.TextInputStyle.Paragraph)
            .setRequired(false)
            .setMaxLength(900);
        const createEvent = new discord_js_1.TextInputBuilder()
            .setCustomId("create_event")
            .setLabel("Create Discord event? (yes/no, default yes)")
            .setStyle(discord_js_1.TextInputStyle.Short)
            .setRequired(false)
            .setMaxLength(3);
        modal.addComponents(new discord_js_1.ActionRowBuilder().addComponents(defender), new discord_js_1.ActionRowBuilder().addComponents(startsAt), new discord_js_1.ActionRowBuilder().addComponents(title), new discord_js_1.ActionRowBuilder().addComponents(description), new discord_js_1.ActionRowBuilder().addComponents(createEvent));
        await interaction.showModal(modal);
        return;
    }
    if (action === "destroyed") {
        const modal = new discord_js_1.ModalBuilder().setCustomId(modalId(action, settlementId)).setTitle(`Declare Destroyed - ${titleBase}`);
        const reason = new discord_js_1.TextInputBuilder()
            .setCustomId("reason")
            .setLabel("Optional reason/details")
            .setStyle(discord_js_1.TextInputStyle.Paragraph)
            .setRequired(false)
            .setMaxLength(900);
        modal.addComponents(new discord_js_1.ActionRowBuilder().addComponents(reason));
        await interaction.showModal(modal);
        return;
    }
    await interaction.reply({ content: "Unknown action.", flags: v10_1.MessageFlags.Ephemeral }).catch(() => null);
}
async function handleMayorDashboardModal(opts) {
    const { interaction, store } = opts;
    if (!interaction.inCachedGuild())
        return;
    if (!interaction.customId.startsWith("mayordashmodal:"))
        return;
    const [, action, settlementId] = interaction.customId.split(":");
    if (!action || !settlementId)
        return;
    const gs = store.get().guilds[interaction.guildId];
    if (!gs) {
        await interaction.reply({
            content: "Server is not initialized. Ask an admin to run `/setup init`.",
            flags: v10_1.MessageFlags.Ephemeral,
        });
        return;
    }
    const settlement = gs.settlements?.[settlementId];
    if (!settlement) {
        await interaction.reply({ content: "Settlement not found.", flags: v10_1.MessageFlags.Ephemeral });
        return;
    }
    const admin = isAdminLike(interaction);
    const canManage = admin || (settlement.mayorRoleId && interaction.member.roles.cache.has(settlement.mayorRoleId));
    if (!canManage) {
        await interaction.reply({
            content: "Only the settlement mayor (or an admin) can do this.",
            flags: v10_1.MessageFlags.Ephemeral,
        });
        return;
    }
    const guild = interaction.guild;
    const now = Date.now();
    if (action === "status") {
        const buildings = interaction.fields.getTextInputValue("buildings")?.trim() ?? "";
        const buyOrders = interaction.fields.getTextInputValue("buy_orders")?.trim() ?? "";
        const notes = interaction.fields.getTextInputValue("notes")?.trim() ?? "";
        if (!buildings && !buyOrders && !notes) {
            await interaction.reply({ content: "Provide at least one field to update.", flags: v10_1.MessageFlags.Ephemeral });
            return;
        }
        await store.update(async (state) => {
            const s = state.guilds[guild.id]?.settlements?.[settlement.id];
            if (!s)
                return;
            if (buildings)
                s.buildings = buildings;
            if (buyOrders)
                s.buyOrders = buyOrders;
            if (notes)
                s.notes = notes;
            s.updatedAtMs = now;
        });
        const updated = store.get().guilds[guild.id]?.settlements?.[settlement.id];
        if (updated)
            await upsertSettlementStatusCard({ guild, settlement: updated, store });
        await (0, overview_1.upsertGuildOverview)(guild, store);
        await interaction.reply({
            content: `Updated status card for **${settlement.name}**.`,
            flags: v10_1.MessageFlags.Ephemeral,
        });
        return;
    }
    if (action === "tier") {
        const tierRaw = interaction.fields.getTextInputValue("tier").trim();
        const parsed = schema_1.SettlementTierSchema.safeParse(Number(tierRaw));
        if (!parsed.success) {
            await interaction.reply({ content: "Tier must be a number 0..5.", flags: v10_1.MessageFlags.Ephemeral });
            return;
        }
        const tier = parsed.data;
        await store.update(async (state) => {
            const s = state.guilds[guild.id]?.settlements?.[settlement.id];
            if (!s)
                return;
            s.tier = tier;
            s.updatedAtMs = now;
        });
        const updated = store.get().guilds[guild.id]?.settlements?.[settlement.id];
        if (updated)
            await upsertSettlementStatusCard({ guild, settlement: updated, store });
        await (0, overview_1.upsertGuildOverview)(guild, store);
        const announce = await ensureCanAnnounce(gs, guild);
        if (announce) {
            await announce
                .send({ content: `Settlement **${settlement.name}** is now tier **${tier}** (${(0, tiers_1.tierName)(tier)}).`, allowedMentions: { parse: [] } })
                .catch(() => null);
        }
        await interaction.reply({
            content: `Set **${settlement.name}** tier to **${tier}** (${(0, tiers_1.tierName)(tier)}).`,
            flags: v10_1.MessageFlags.Ephemeral,
        });
        return;
    }
    if (action === "announce") {
        const message = interaction.fields.getTextInputValue("message").trim();
        const pingRaw = (interaction.fields.getTextInputValue("ping") ?? "").trim().toLowerCase();
        const pingCitizens = pingRaw ? ["y", "yes", "true", "1"].includes(pingRaw) : true;
        const targetChannelId = settlement.channelId ?? gs.config.announcementsChannelId ?? null;
        if (!targetChannelId) {
            await interaction.reply({
                content: "No announce channel configured. Ask an admin to run `/setup init`.",
                flags: v10_1.MessageFlags.Ephemeral,
            });
            return;
        }
        const targetChannel = await guild.channels.fetch(targetChannelId).catch(() => null);
        if (!targetChannel || targetChannel.type !== discord_js_1.ChannelType.GuildText) {
            await interaction.reply({ content: "Announcement channel is missing or not a text channel.", flags: v10_1.MessageFlags.Ephemeral });
            return;
        }
        let content = message;
        let allowedRoleId = null;
        if (pingCitizens && settlement.citizenRoleId) {
            const role = await guild.roles.fetch(settlement.citizenRoleId).catch(() => null);
            if (role) {
                allowedRoleId = role.id;
                content = `<@&${role.id}> ${message}`;
            }
        }
        await targetChannel.send({
            content,
            allowedMentions: allowedRoleId ? { roles: [allowedRoleId] } : { parse: [] },
        });
        await interaction.reply({
            content: `Announcement sent for **${settlement.name}**.`,
            flags: v10_1.MessageFlags.Ephemeral,
        });
        return;
    }
    if (action === "election") {
        const timezone = gs.config.timezone || "UTC";
        const reg = parseWhen(interaction.fields.getTextInputValue("registration_start").trim(), timezone);
        const voteStart = parseWhen(interaction.fields.getTextInputValue("voting_start").trim(), timezone);
        const voteEnd = parseWhen(interaction.fields.getTextInputValue("voting_end").trim(), timezone);
        if (!reg || !voteStart || !voteEnd) {
            await interaction.reply({
                content: `Couldn't parse time(s). Use \`YYYY-MM-DD HH:mm\` in ${timezone}.`,
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
        if (voteEnd.toMillis() <= now) {
            await interaction.reply({ content: "Voting end must be in the future.", flags: v10_1.MessageFlags.Ephemeral });
            return;
        }
        const announceChannelId = gs.config.announcementsChannelId ?? null;
        if (!announceChannelId) {
            await interaction.reply({
                content: "No announcements channel configured. Ask an admin to run `/setup init`.",
                flags: v10_1.MessageFlags.Ephemeral,
            });
            return;
        }
        const oldIds = settlement.election.scheduleItemIds ?? [];
        await store.update(async (state) => {
            const g = state.guilds[guild.id];
            if (!g)
                return;
            for (const id of oldIds)
                delete g.schedule[id];
        });
        const idReg = (0, ids_1.newId)("election_reg");
        const idVoteOpen = (0, ids_1.newId)("election_voteopen");
        const idVoteEndsSoon = (0, ids_1.newId)("election_voteends");
        const idVoteClose = (0, ids_1.newId)("election_voteclose");
        const voteEndsSoonAt = voteEnd.minus({ hours: 24 });
        const includeVoteEndsSoon = voteEndsSoonAt.toMillis() > now;
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
                description: null,
                announceChannelId,
                mentionRoleId: null,
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
                announceChannelId,
                mentionRoleId: null,
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
                    announceChannelId,
                    mentionRoleId: null,
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
                announceChannelId,
                mentionRoleId: null,
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
        const chan = await guild.channels.fetch(announceChannelId).catch(() => null);
        if (chan && chan.type === discord_js_1.ChannelType.GuildText) {
            await chan.send(`Election schedule updated for **${settlement.name}**.\nRegistration: <t:${Math.floor(reg.toSeconds())}:F>\nVoting: <t:${Math.floor(voteStart.toSeconds())}:F> -> <t:${Math.floor(voteEnd.toSeconds())}:F>`);
        }
        await interaction.reply({
            content: `Election schedule set for **${settlement.name}**.`,
            flags: v10_1.MessageFlags.Ephemeral,
        });
        return;
    }
    if (action === "war" || action === "siege") {
        const kind = action === "siege" ? "siege" : "war";
        const defenderInput = interaction.fields.getTextInputValue("defender").trim();
        const title = interaction.fields.getTextInputValue("title").trim();
        const description = (interaction.fields.getTextInputValue("description") ?? "").trim();
        const startsAtInput = interaction.fields.getTextInputValue("starts_at").trim();
        const createEventRaw = interaction.fields.getTextInputValue("create_event");
        const createEvent = parseYesNo(createEventRaw, true);
        const defender = findSettlement(gs, defenderInput);
        if (!defender) {
            await interaction.reply({
                content: "Defender settlement not found. Use the exact name from the settlement list.",
                flags: v10_1.MessageFlags.Ephemeral,
            });
            return;
        }
        if (defender.id === settlement.id) {
            await interaction.reply({ content: "Attacker and defender must be different settlements.", flags: v10_1.MessageFlags.Ephemeral });
            return;
        }
        const timezone = gs.config.timezone || "UTC";
        const dt = parseWhen(startsAtInput, timezone);
        if (!dt) {
            await interaction.reply({
                content: `Couldn't parse time. Use \`YYYY-MM-DD HH:mm\` in ${timezone}.`,
                flags: v10_1.MessageFlags.Ephemeral,
            });
            return;
        }
        if (dt.toMillis() <= now) {
            await interaction.reply({ content: "Start time must be in the future.", flags: v10_1.MessageFlags.Ephemeral });
            return;
        }
        const announceChannelId = gs.config.announcementsChannelId ?? null;
        if (!announceChannelId) {
            await interaction.reply({
                content: "No announcements channel configured. Ask an admin to run `/setup init`.",
                flags: v10_1.MessageFlags.Ephemeral,
            });
            return;
        }
        const id = (0, ids_1.newId)("war");
        let discordEventId = null;
        if (createEvent) {
            const name = `${kind === "siege" ? "Siege" : "War"}: ${settlement.name} vs ${defender.name}`;
            const start = dt.toJSDate();
            const end = dt.plus({ hours: 2 }).toJSDate();
            const eventDescription = [
                `${kind === "siege" ? "Siege" : "War"} declared by ${settlement.name} vs ${defender.name}.`,
                title ? `Title: ${title}` : null,
                description ? `\n${description}` : null,
            ]
                .filter(Boolean)
                .join("\n");
            const ev = await guild.scheduledEvents
                .create({
                name,
                scheduledStartTime: start,
                scheduledEndTime: end,
                privacyLevel: discord_js_1.GuildScheduledEventPrivacyLevel.GuildOnly,
                entityType: discord_js_1.GuildScheduledEventEntityType.External,
                entityMetadata: { location: "In-game (Ashes of Creation)" },
                description: eventDescription.slice(0, 1000),
            })
                .catch(() => null);
            discordEventId = ev?.id ?? null;
        }
        await store.update(async (state) => {
            const g = state.guilds[guild.id];
            if (!g)
                return;
            g.schedule[id] = {
                id,
                type: "war",
                settlementId: settlement.id,
                warDefenderSettlementId: defender.id,
                warKind: kind === "siege" ? "siege" : "war",
                discordEventId,
                title: `${kind === "siege" ? "Siege" : "War"}: ${settlement.name} vs ${defender.name} - ${title}`,
                description: description || null,
                announceChannelId,
                mentionRoleId: null,
                startsAtMs: dt.toMillis(),
                reminderOffsetsMinutes: [1440, 60, 15, 0],
                sentOffsetMinutes: [],
                createdByUserId: interaction.user.id,
                createdAtMs: now,
            };
        });
        const chan = await guild.channels.fetch(announceChannelId).catch(() => null);
        if (chan && chan.type === discord_js_1.ChannelType.GuildText) {
            const desc = description ? `\n${description}` : "";
            const kindLabel = kind === "siege" ? "Siege" : "War";
            const eventUrl = discordEventId ? `\nEvent: https://discord.com/events/${guild.id}/${discordEventId}` : "";
            await chan
                .send({
                content: `**${kindLabel} declared**: **${settlement.name}** (attacker) vs **${defender.name}** (defender) — ${title}\nStarts at <t:${Math.floor(dt.toSeconds())}:F>.${desc}${eventUrl}`,
                allowedMentions: { parse: [] },
            })
                .catch(() => null);
        }
        await interaction.reply({
            content: `${kind === "siege" ? "Siege" : "War"} scheduled (**${id}**) for **${settlement.name}** vs **${defender.name}**.`,
            flags: v10_1.MessageFlags.Ephemeral,
        });
        return;
    }
    if (action === "destroyed") {
        const reason = (interaction.fields.getTextInputValue("reason") ?? "").trim();
        // Remove mayor role from existing mayor (if any)
        if (settlement.mayorRoleId && settlement.mayorUserId) {
            const prev = await guild.members.fetch(settlement.mayorUserId).catch(() => null);
            if (prev) {
                await prev.roles.remove(settlement.mayorRoleId).catch(() => null);
                const mayorAggregateRoleId = await (0, mayorAggregate_1.getOrCreateMayorAggregateRoleId)(store, guild);
                const settlementMayorRoleIds = (0, mayorAggregate_1.allSettlementMayorRoleIds)(store, guild.id);
                if (mayorAggregateRoleId) {
                    await (0, mayorAggregate_1.syncMayorAggregateForMember)({ member: prev, mayorAggregateRoleId, settlementMayorRoleIds });
                }
            }
        }
        await store.update(async (state) => {
            const s = state.guilds[guild.id]?.settlements?.[settlement.id];
            if (!s)
                return;
            s.tier = 0;
            s.mayorUserId = null;
            s.mayorSinceMs = null;
            s.mayorUntilMs = null;
            s.buildings = "";
            s.buyOrders = "";
            if (reason)
                s.notes = `Destroyed: ${reason}`;
            s.updatedAtMs = now;
        });
        const updated = store.get().guilds[guild.id]?.settlements?.[settlement.id];
        if (updated)
            await upsertSettlementStatusCard({ guild, settlement: updated, store });
        await (0, overview_1.upsertGuildOverview)(guild, store);
        const announce = await ensureCanAnnounce(gs, guild);
        if (announce) {
            await announce
                .send({
                content: `Settlement **${settlement.name}** was declared **destroyed** (tier reset to 0).${reason ? `\nReason: ${reason}` : ""}`,
                allowedMentions: { parse: [] },
            })
                .catch(() => null);
        }
        await interaction.reply({
            content: `Marked **${settlement.name}** as destroyed (tier reset to 0).`,
            flags: v10_1.MessageFlags.Ephemeral,
        });
        return;
    }
    await interaction.reply({ content: "Unknown action.", flags: v10_1.MessageFlags.Ephemeral });
}
