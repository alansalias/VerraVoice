"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireGuild = requireGuild;
exports.isAdmin = isAdmin;
exports.isStaffMember = isStaffMember;
exports.canReviewMayorRequests = canReviewMayorRequests;
exports.canManageSettlement = canManageSettlement;
const discord_js_1 = require("discord.js");
function requireGuild(interaction) {
    if (!interaction.inCachedGuild()) {
        throw new Error("This command can only be used inside a server.");
    }
}
function isAdmin(interaction) {
    return (interaction.memberPermissions?.has(discord_js_1.PermissionFlagsBits.Administrator) ||
        interaction.memberPermissions?.has(discord_js_1.PermissionFlagsBits.ManageGuild) ||
        false);
}
function isStaffMember(member, config) {
    const perms = member.permissions;
    if (perms.has(discord_js_1.PermissionFlagsBits.Administrator) || perms.has(discord_js_1.PermissionFlagsBits.ManageGuild))
        return true;
    const adminRoleId = config?.adminRoleId ?? null;
    const moderatorRoleId = config?.moderatorRoleId ?? null;
    if (adminRoleId && member.roles.cache.has(adminRoleId))
        return true;
    if (moderatorRoleId && member.roles.cache.has(moderatorRoleId))
        return true;
    return false;
}
function canReviewMayorRequests(interaction, config) {
    if (isAdmin(interaction))
        return true;
    const adminRoleId = config?.adminRoleId ?? null;
    const moderatorRoleId = config?.moderatorRoleId ?? null;
    const member = interaction.member;
    if (!member)
        return false;
    if (adminRoleId && member.roles.cache.has(adminRoleId))
        return true;
    if (moderatorRoleId && member.roles.cache.has(moderatorRoleId))
        return true;
    return (interaction.memberPermissions?.has(discord_js_1.PermissionFlagsBits.ModerateMembers) ||
        interaction.memberPermissions?.has(discord_js_1.PermissionFlagsBits.ManageRoles) ||
        false);
}
function canManageSettlement(member, settlement, isAdminUser) {
    if (isAdminUser)
        return true;
    if (!settlement.mayorRoleId)
        return false;
    return member.roles.cache.has(settlement.mayorRoleId);
}
