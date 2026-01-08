"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureMayorAggregateRole = ensureMayorAggregateRole;
exports.getOrCreateMayorAggregateRoleId = getOrCreateMayorAggregateRoleId;
exports.allSettlementMayorRoleIds = allSettlementMayorRoleIds;
exports.syncMayorAggregateForMember = syncMayorAggregateForMember;
const discord_js_1 = require("discord.js");
const MAYOR_ROLE_NAME = "Mayor";
async function ensureMayorAggregateRole(guild) {
    const existing = guild.roles.cache.find((r) => r.name.toLowerCase() === MAYOR_ROLE_NAME.toLowerCase()) ?? null;
    if (existing) {
        if (!existing.hoist) {
            await existing.setHoist(true, "VerraVoice: show mayors separately").catch(() => null);
        }
        return existing.id;
    }
    const created = await guild.roles.create({
        name: MAYOR_ROLE_NAME,
        hoist: true,
        mentionable: false,
        permissions: [discord_js_1.PermissionFlagsBits.ViewChannel],
        reason: "VerraVoice: create aggregate Mayor role",
    });
    return created.id;
}
async function getOrCreateMayorAggregateRoleId(store, guild) {
    const gs = store.get().guilds[guild.id];
    if (!gs)
        return null;
    const configuredId = gs.config.mayorAggregateRoleId;
    if (configuredId) {
        const role = guild.roles.cache.get(configuredId) ?? (await guild.roles.fetch(configuredId).catch(() => null));
        if (role) {
            if (!role.hoist) {
                await role.setHoist(true, "VerraVoice: show mayors separately").catch(() => null);
            }
            return role.id;
        }
    }
    const id = await ensureMayorAggregateRole(guild);
    await store.update(async (state) => {
        const g = state.guilds[guild.id];
        if (!g)
            return;
        g.config.mayorAggregateRoleId = id;
    });
    return id;
}
function allSettlementMayorRoleIds(store, guildId) {
    const gs = store.get().guilds[guildId];
    if (!gs)
        return [];
    return Array.from(new Set(Object.values(gs.settlements ?? {})
        .map((s) => s.mayorRoleId)
        .filter(Boolean)));
}
async function syncMayorAggregateForMember(opts) {
    const { member, mayorAggregateRoleId, settlementMayorRoleIds } = opts;
    if (!member)
        return;
    const shouldHave = settlementMayorRoleIds.some((rid) => member.roles.cache.has(rid));
    const has = member.roles.cache.has(mayorAggregateRoleId);
    if (shouldHave && !has) {
        await member.roles.add(mayorAggregateRoleId).catch(() => null);
    }
    else if (!shouldHave && has) {
        await member.roles.remove(mayorAggregateRoleId).catch(() => null);
    }
}
