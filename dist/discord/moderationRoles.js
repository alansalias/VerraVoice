"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.moderatorRoleIds = moderatorRoleIds;
exports.adminRoleIds = adminRoleIds;
const discord_js_1 = require("discord.js");
function moderatorRoleIds(guild) {
    const ids = [];
    for (const role of guild.roles.cache.values()) {
        if (role.id === guild.roles.everyone.id)
            continue;
        const perms = role.permissions;
        if (perms.has(discord_js_1.PermissionFlagsBits.Administrator) ||
            perms.has(discord_js_1.PermissionFlagsBits.ManageGuild) ||
            perms.has(discord_js_1.PermissionFlagsBits.ModerateMembers) ||
            perms.has(discord_js_1.PermissionFlagsBits.ManageRoles)) {
            ids.push(role.id);
        }
    }
    return Array.from(new Set(ids));
}
function adminRoleIds(guild) {
    const ids = [];
    for (const role of guild.roles.cache.values()) {
        if (role.id === guild.roles.everyone.id)
            continue;
        const perms = role.permissions;
        if (perms.has(discord_js_1.PermissionFlagsBits.Administrator) || perms.has(discord_js_1.PermissionFlagsBits.ManageGuild)) {
            ids.push(role.id);
        }
    }
    return Array.from(new Set(ids));
}
