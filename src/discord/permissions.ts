import { ChatInputCommandInteraction, GuildMember, PermissionFlagsBits } from "discord.js";
import { Settlement } from "../state/schema";

export function requireGuild(
  interaction: ChatInputCommandInteraction,
): asserts interaction is ChatInputCommandInteraction<"cached"> {
  if (!interaction.inCachedGuild()) {
    throw new Error("This command can only be used inside a server.");
  }
}

export function isAdmin(interaction: ChatInputCommandInteraction<"cached">) {
  return (
    interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ||
    interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ||
    false
  );
}

export function canReviewMayorRequests(interaction: ChatInputCommandInteraction<"cached">) {
  return (
    interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ||
    interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ||
    interaction.memberPermissions?.has(PermissionFlagsBits.ModerateMembers) ||
    interaction.memberPermissions?.has(PermissionFlagsBits.ManageRoles) ||
    false
  );
}

export function canManageSettlement(member: GuildMember, settlement: Settlement, isAdminUser: boolean) {
  if (isAdminUser) return true;
  if (!settlement.mayorRoleId) return false;
  return member.roles.cache.has(settlement.mayorRoleId);
}
