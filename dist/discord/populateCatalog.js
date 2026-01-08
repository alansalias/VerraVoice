"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.populateFromCatalog = populateFromCatalog;
const discord_js_1 = require("discord.js");
const strings_1 = require("../utils/strings");
const settlementCard_1 = require("./embeds/settlementCard");
const overview_1 = require("./overview");
const moderationRoles_1 = require("./moderationRoles");
function normalizeName(name) {
    return name.trim();
}
function botCanManageChannel(opts) {
    const me = opts.guild.members.me;
    if (!me)
        return true; // fallback; avoid false negatives during startup
    const perms = opts.channel.permissionsFor(me);
    if (!perms)
        return false;
    return perms.has(discord_js_1.PermissionFlagsBits.ViewChannel) && perms.has(discord_js_1.PermissionFlagsBits.ManageChannels);
}
async function ensureCategory(guild, name) {
    const existing = guild.channels.cache.find((c) => c.type === discord_js_1.ChannelType.GuildCategory && c.name.toLowerCase() === name.toLowerCase());
    if (existing)
        return existing.id;
    const created = await guild.channels.create({ name, type: discord_js_1.ChannelType.GuildCategory });
    return created.id;
}
async function ensureRole(guild, roleName) {
    const existing = guild.roles.cache.find((r) => r.name.toLowerCase() === roleName.toLowerCase()) ?? null;
    if (existing) {
        if (existing.mentionable) {
            await existing.setMentionable(false, "VerraVoice: lock down role pings").catch(() => null);
        }
        return existing.id;
    }
    const created = await guild.roles.create({ name: roleName, mentionable: false });
    return created.id;
}
async function ensureSettlementChannel(opts) {
    const desired = opts.settlement.id;
    const existingById = opts.settlement.channelId
        ? await opts.guild.channels.fetch(opts.settlement.channelId).catch(() => null)
        : null;
    const existingByName = opts.guild.channels.cache.find((c) => c.type === discord_js_1.ChannelType.GuildText && c.name.toLowerCase() === desired.toLowerCase()) ?? null;
    const existing = existingById ?? existingByName;
    const overwrites = [
        {
            id: opts.guild.roles.everyone.id,
            deny: [discord_js_1.PermissionFlagsBits.ViewChannel, discord_js_1.PermissionFlagsBits.MentionEveryone],
        },
        {
            id: opts.citizenRoleId,
            allow: [discord_js_1.PermissionFlagsBits.ViewChannel, discord_js_1.PermissionFlagsBits.SendMessages, discord_js_1.PermissionFlagsBits.ReadMessageHistory],
            deny: [discord_js_1.PermissionFlagsBits.MentionEveryone],
        },
        {
            id: opts.viewRoleId,
            allow: [discord_js_1.PermissionFlagsBits.ViewChannel, discord_js_1.PermissionFlagsBits.ReadMessageHistory],
            deny: [discord_js_1.PermissionFlagsBits.SendMessages, discord_js_1.PermissionFlagsBits.MentionEveryone],
        },
        ...(opts.zoneViewRoleId
            ? [
                {
                    id: opts.zoneViewRoleId,
                    allow: [discord_js_1.PermissionFlagsBits.ViewChannel, discord_js_1.PermissionFlagsBits.ReadMessageHistory],
                    deny: [discord_js_1.PermissionFlagsBits.SendMessages, discord_js_1.PermissionFlagsBits.MentionEveryone],
                },
            ]
            : []),
        {
            id: opts.mayorRoleId,
            allow: [discord_js_1.PermissionFlagsBits.ViewChannel, discord_js_1.PermissionFlagsBits.SendMessages, discord_js_1.PermissionFlagsBits.ReadMessageHistory],
            deny: [discord_js_1.PermissionFlagsBits.MentionEveryone],
        },
        ...opts.modRoleIds.map((id) => ({
            id,
            allow: [discord_js_1.PermissionFlagsBits.ViewChannel, discord_js_1.PermissionFlagsBits.SendMessages, discord_js_1.PermissionFlagsBits.ReadMessageHistory],
        })),
        {
            id: opts.botId,
            allow: [
                discord_js_1.PermissionFlagsBits.ViewChannel,
                discord_js_1.PermissionFlagsBits.SendMessages,
                discord_js_1.PermissionFlagsBits.EmbedLinks,
                discord_js_1.PermissionFlagsBits.ReadMessageHistory,
                discord_js_1.PermissionFlagsBits.MentionEveryone,
            ],
        },
    ];
    if (existing && existing.type === discord_js_1.ChannelType.GuildText) {
        // If the bot can't access/manage this channel (stale/locked down), don't try to edit it.
        if (!botCanManageChannel({ guild: opts.guild, channel: existing })) {
            // Fall through to creating a fresh channel.
        }
        else {
            // Ensure in correct category and perms
            try {
                await existing.edit({
                    name: desired,
                    parent: opts.categoryId,
                    topic: `Settlement: ${opts.settlement.name}`,
                });
                await existing.permissionOverwrites.set(overwrites).catch(() => null);
                return existing.id;
            }
            catch {
                // Fall through to creating a fresh channel.
            }
        }
    }
    // Create a fresh channel. If Discord rejects the name (rare), fall back to a suffixed name.
    const tryNames = [desired, `${desired}-vv`, `${desired}-vv2`];
    for (const name of tryNames) {
        const created = await opts.guild.channels
            .create({
            name,
            type: discord_js_1.ChannelType.GuildText,
            parent: opts.categoryId,
            topic: `Settlement: ${opts.settlement.name}`,
            permissionOverwrites: overwrites,
        })
            .catch(() => null);
        if (created)
            return created.id;
    }
    throw new Error(`Failed to create settlement channel for ${opts.settlement.name}. Check bot permissions.`);
}
async function ensureZoneMayorsChannel(opts) {
    const zoneKey = opts.zoneName.toLowerCase();
    const channelName = `mayors-${(0, strings_1.slugify)(opts.zoneName) || (0, strings_1.slugify)(zoneKey) || "zone"}`;
    const gs = opts.store.get().guilds[opts.guild.id];
    const existingId = gs?.config?.zoneMayorChannelIds?.[zoneKey] ?? null;
    const existing = (existingId ? await opts.guild.channels.fetch(existingId).catch(() => null) : null) ??
        opts.guild.channels.cache.find((c) => c.type === discord_js_1.ChannelType.GuildText && c.name.toLowerCase() === channelName.toLowerCase()) ??
        null;
    const overwrites = [
        { id: opts.guild.roles.everyone.id, deny: [discord_js_1.PermissionFlagsBits.ViewChannel, discord_js_1.PermissionFlagsBits.MentionEveryone] },
        {
            id: opts.botId,
            allow: [
                discord_js_1.PermissionFlagsBits.ViewChannel,
                discord_js_1.PermissionFlagsBits.SendMessages,
                discord_js_1.PermissionFlagsBits.EmbedLinks,
                discord_js_1.PermissionFlagsBits.ReadMessageHistory,
                discord_js_1.PermissionFlagsBits.MentionEveryone,
            ],
        },
        ...Array.from(new Set(opts.citizenRoleIds)).map((id) => ({
            id,
            allow: [discord_js_1.PermissionFlagsBits.ViewChannel, discord_js_1.PermissionFlagsBits.ReadMessageHistory],
            deny: [discord_js_1.PermissionFlagsBits.SendMessages, discord_js_1.PermissionFlagsBits.MentionEveryone],
        })),
        ...(opts.zoneViewRoleId
            ? [
                {
                    id: opts.zoneViewRoleId,
                    allow: [discord_js_1.PermissionFlagsBits.ViewChannel, discord_js_1.PermissionFlagsBits.ReadMessageHistory],
                    deny: [discord_js_1.PermissionFlagsBits.SendMessages, discord_js_1.PermissionFlagsBits.MentionEveryone],
                },
            ]
            : []),
        ...Array.from(new Set(opts.mayorRoleIds)).map((id) => ({
            id,
            allow: [discord_js_1.PermissionFlagsBits.ViewChannel, discord_js_1.PermissionFlagsBits.SendMessages, discord_js_1.PermissionFlagsBits.ReadMessageHistory],
            deny: [discord_js_1.PermissionFlagsBits.MentionEveryone],
        })),
    ];
    if (existing && existing.type === discord_js_1.ChannelType.GuildText) {
        if (botCanManageChannel({ guild: opts.guild, channel: existing })) {
            await existing
                .edit({
                name: channelName,
                parent: opts.categoryId,
                topic: `Zone mayors channel for ${opts.zoneName} (citizens can read; mayors can post).`,
            })
                .catch(() => null);
            await existing.permissionOverwrites.set(overwrites).catch(() => null);
            await existing.setPosition(0).catch(() => null);
            await opts.store.update(async (state) => {
                const g = state.guilds[opts.guild.id];
                if (!g)
                    return;
                g.config.zoneMayorChannelIds[zoneKey] = existing.id;
            });
            return;
        }
    }
    const created = await opts.guild.channels
        .create({
        name: channelName,
        type: discord_js_1.ChannelType.GuildText,
        parent: opts.categoryId,
        topic: `Zone mayors channel for ${opts.zoneName} (citizens can read; mayors can post).`,
        permissionOverwrites: overwrites,
    })
        .catch(() => null);
    if (created) {
        await created.setPosition(0).catch(() => null);
        await opts.store.update(async (state) => {
            const g = state.guilds[opts.guild.id];
            if (!g)
                return;
            g.config.zoneMayorChannelIds[zoneKey] = created.id;
        });
    }
}
async function upsertStatusCard(guild, settlement, store) {
    if (!settlement.channelId)
        return;
    const channel = await guild.channels.fetch(settlement.channelId).catch(() => null);
    if (!channel || channel.type !== discord_js_1.ChannelType.GuildText)
        return;
    const text = channel;
    const embed = (0, settlementCard_1.buildSettlementCard)(settlement);
    if (settlement.statusCardMessageId) {
        const msg = await text.messages.fetch(settlement.statusCardMessageId).catch(() => null);
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
    await store.update(async (state) => {
        const s = state.guilds[guild.id]?.settlements?.[settlement.id];
        if (!s)
            return;
        s.statusCardMessageId = msg.id;
    });
}
async function populateFromCatalog(opts) {
    const { guild, store, catalog } = opts;
    const botMember = guild.members.me ?? (await guild.members.fetchMe());
    const botId = botMember.id;
    const now = Date.now();
    // Ensure guild state exists
    await store.update(async (state) => {
        state.guilds[guild.id] ??= {
            config: {
                timezone: "UTC",
                settlementsCategoryId: null,
                moderationCategoryId: null,
                announcementsChannelId: null,
                adminRoleId: null,
                moderatorRoleId: null,
                mayorAggregateRoleId: null,
                mayorHowToChannelId: null,
                mayorHowToMessageId: null,
                adminChatChannelId: null,
                moderatorChatChannelId: null,
                allMayorsChannelId: null,
                guildLeaderRoleId: null,
                guildOfficerRoleId: null,
                guildManagementChannelId: null,
                guildManagementMessageId: null,
                guildLeadershipChannelId: null,
                infoCategoryId: null,
                generalCategoryId: null,
                serverAnnouncementsChannelId: null,
                rulesChannelId: null,
                rulesMessageId: null,
                selfAssignChannelId: null,
                selfAssignMessageId: null,
                mayorInfoChannelId: null,
                mayorInfoMessageId: null,
                requestsChannelId: null,
                overviewChannelId: null,
                overviewMessageId: null,
                zoneMayorChannelIds: {},
                zoneViewRoleIds: {},
            },
            settlements: {},
            mayorRequests: {},
            guildRoles: {},
            roleRequests: {},
            schedule: {},
        };
    });
    for (const zone of catalog.zones) {
        const zoneName = normalizeName(zone.zone);
        if (!zoneName)
            continue;
        const zoneKey = zoneName.toLowerCase();
        const categoryId = await ensureCategory(guild, zoneName);
        const zoneMayorRoleIds = [];
        const zoneCitizenRoleIds = [];
        const modRoleIds = (0, moderationRoles_1.moderatorRoleIds)(guild);
        const zoneViewRoleId = await ensureRole(guild, `View Zone - ${zoneName}`);
        await store.update(async (state) => {
            const g = state.guilds[guild.id];
            if (!g)
                return;
            g.config.zoneViewRoleIds[zoneKey] = zoneViewRoleId;
        });
        for (const rawName of zone.settlements) {
            const settlementName = normalizeName(rawName);
            if (!settlementName)
                continue;
            const settlementIdBase = (0, strings_1.slugify)(settlementName) || settlementName.toLowerCase();
            let settlementId = settlementIdBase;
            const currentGuildState = store.get().guilds[guild.id];
            if (currentGuildState?.settlements?.[settlementId] && currentGuildState.settlements[settlementId].name !== settlementName) {
                let i = 2;
                while (currentGuildState.settlements[`${settlementIdBase}-${i}`])
                    i++;
                settlementId = `${settlementIdBase}-${i}`;
            }
            // Ensure settlement state exists
            await store.update(async (state) => {
                const gs = state.guilds[guild.id];
                if (!gs)
                    return;
                const existing = gs.settlements[settlementId];
                if (existing) {
                    existing.name = settlementName;
                    existing.zone = zoneName;
                    existing.updatedAtMs = now;
                    return;
                }
                gs.settlements[settlementId] = {
                    id: settlementId,
                    name: settlementName,
                    zone: zoneName,
                    tier: 0,
                    mayorUserId: null,
                    mayorGuildName: null,
                    mayorSinceMs: null,
                    mayorUntilMs: null,
                    mayorRoleId: null,
                    citizenRoleId: null,
                    viewRoleId: null,
                    channelId: null,
                    statusCardMessageId: null,
                    buildings: "",
                    buyOrders: "",
                    notes: "",
                    election: { registrationStartMs: null, votingStartMs: null, votingEndMs: null, scheduleItemIds: [] },
                    createdAtMs: now,
                    updatedAtMs: now,
                };
            });
            const gs = store.get().guilds[guild.id];
            const settlement = gs?.settlements?.[settlementId];
            if (!settlement)
                continue;
            const mayorRoleId = await ensureRole(guild, `Mayor of ${settlement.name}`);
            const citizenRoleId = await ensureRole(guild, `${settlement.name} Citizens`);
            const viewRoleId = await ensureRole(guild, `View ${settlement.name}`);
            zoneMayorRoleIds.push(mayorRoleId);
            zoneCitizenRoleIds.push(citizenRoleId);
            const channelId = await ensureSettlementChannel({
                guild,
                categoryId,
                settlement,
                mayorRoleId,
                citizenRoleId,
                viewRoleId,
                zoneViewRoleId,
                botId,
                modRoleIds,
            });
            await store.update(async (state) => {
                const s = state.guilds[guild.id]?.settlements?.[settlementId];
                if (!s)
                    return;
                s.mayorRoleId = mayorRoleId;
                s.citizenRoleId = citizenRoleId;
                s.viewRoleId = viewRoleId;
                s.channelId = channelId;
                s.zone = zoneName;
                s.updatedAtMs = Date.now();
            });
            const updated = store.get().guilds[guild.id]?.settlements?.[settlementId];
            if (updated)
                await upsertStatusCard(guild, updated, store);
        }
        // Create/update zone mayors channel after we know the citizen/mayor roles.
        await ensureZoneMayorsChannel({
            guild,
            store,
            zoneName,
            categoryId,
            botId,
            mayorRoleIds: zoneMayorRoleIds,
            citizenRoleIds: zoneCitizenRoleIds,
            zoneViewRoleId,
        });
    }
    await (0, overview_1.upsertGuildOverview)(guild, store);
}
