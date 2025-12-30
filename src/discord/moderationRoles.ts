import { Guild, PermissionFlagsBits } from "discord.js";

export function moderatorRoleIds(guild: Guild) {
  const ids: string[] = [];
  for (const role of guild.roles.cache.values()) {
    if (role.id === guild.roles.everyone.id) continue;
    const perms = role.permissions;
    if (
      perms.has(PermissionFlagsBits.Administrator) ||
      perms.has(PermissionFlagsBits.ManageGuild) ||
      perms.has(PermissionFlagsBits.ModerateMembers) ||
      perms.has(PermissionFlagsBits.ManageRoles)
    ) {
      ids.push(role.id);
    }
  }
  return Array.from(new Set(ids));
}

export function adminRoleIds(guild: Guild) {
  const ids: string[] = [];
  for (const role of guild.roles.cache.values()) {
    if (role.id === guild.roles.everyone.id) continue;
    const perms = role.permissions;
    if (perms.has(PermissionFlagsBits.Administrator) || perms.has(PermissionFlagsBits.ManageGuild)) {
      ids.push(role.id);
    }
  }
  return Array.from(new Set(ids));
}
