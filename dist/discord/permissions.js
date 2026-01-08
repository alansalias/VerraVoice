"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireGuild = requireGuild;
exports.isAdmin = isAdmin;
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
function canReviewMayorRequests(interaction) {
    return (interaction.memberPermissions?.has(discord_js_1.PermissionFlagsBits.Administrator) ||
        interaction.memberPermissions?.has(discord_js_1.PermissionFlagsBits.ManageGuild) ||
        interaction.memberPermissions?.has(discord_js_1.PermissionFlagsBits.ModerateMembers) ||
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
