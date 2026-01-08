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

export function isStaffMember(
  member: GuildMember,
  config?: { adminRoleId?: string | null; moderatorRoleId?: string | null },
) {
  const perms = member.permissions;
  if (perms.has(PermissionFlagsBits.Administrator) || perms.has(PermissionFlagsBits.ManageGuild)) return true;
  const adminRoleId = config?.adminRoleId ?? null;
  const moderatorRoleId = config?.moderatorRoleId ?? null;
  if (adminRoleId && member.roles.cache.has(adminRoleId)) return true;
  if (moderatorRoleId && member.roles.cache.has(moderatorRoleId)) return true;
  return false;
}

export function canReviewMayorRequests(
  interaction: ChatInputCommandInteraction<"cached">,
  config?: { adminRoleId?: string | null; moderatorRoleId?: string | null },
) {
  if (isAdmin(interaction)) return true;
  const adminRoleId = config?.adminRoleId ?? null;
  const moderatorRoleId = config?.moderatorRoleId ?? null;
  const member = interaction.member;
  if (!member) return false;
  if (adminRoleId && member.roles.cache.has(adminRoleId)) return true;
  if (moderatorRoleId && member.roles.cache.has(moderatorRoleId)) return true;
  return (
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
