import { EmbedBuilder, Guild, GuildMember } from "discord.js";
import { RoleRequest } from "../state/schema";
import { StateStore } from "../state/store";

function guildChannelLink(guildId: string, channelId: string) {
  return `https://discord.com/channels/${guildId}/${channelId}`;
}

function roleLabel(type: RoleRequest["type"]) {
  return type === "guild_leader" ? "Guild Leader" : "Guild Officer";
}

export async function dmGuildRoleWelcome(opts: {
  guild: Guild;
  store: StateStore;
  requesterUserId: string;
  type: RoleRequest["type"];
  guildName: string;
  guildRoleId: string | null;
  member: GuildMember | null;
}) {
  const { guild, store, requesterUserId, type, guildName, guildRoleId, member } = opts;

  const gs = store.get().guilds[guild.id];
  if (!gs) return;

  const roleName = roleLabel(type);
  const trimmedGuildName = guildName.trim();
  const inGuild = !!member;
  const roleStatus = inGuild ? "active" : "will apply when you join";

  const rolesLines = [`- **${roleName}** (server role, ${roleStatus})`];
  if (trimmedGuildName) {
    if (guildRoleId) {
      rolesLines.push(`- **${trimmedGuildName}** (guild role, ${roleStatus})`);
    } else {
      rolesLines.push(`- **${trimmedGuildName}** (guild role, needs staff attention)`);
    }
  }

  const actionLines = [
    "- Invite members to your guild role: `/ginvite user:<member> guild:<name>`.",
    "- Rename your guild role from the Guild controls panel (leaders and officers).",
    type === "guild_leader"
      ? "- Delete your guild role from the Guild controls panel."
      : "- Guild Leaders can delete the guild role from the Guild controls panel.",
  ];

  const embed = new EmbedBuilder()
    .setTitle(`Role approved: ${roleName}`)
    .setColor(0x1f8b4c)
    .setDescription(`Your request was approved on **${guild.name}**.`)
    .addFields(
      { name: "Roles", value: rolesLines.join("\n") },
      { name: "What you can do now", value: actionLines.join("\n") },
    )
    .setFooter({ text: "VerraVoice" });

  const managementChannelId = gs.config.guildManagementChannelId ?? null;
  const leadershipChannelId = gs.config.guildLeadershipChannelId ?? null;
  if (managementChannelId) {
    embed.addFields({
      name: "Guild controls panel",
      value: guildChannelLink(guild.id, managementChannelId),
    });
  }
  if (leadershipChannelId) {
    embed.addFields({
      name: "Guild leadership chat",
      value: guildChannelLink(guild.id, leadershipChannelId),
    });
  }

  const user = member?.user ?? (await guild.client.users.fetch(requesterUserId).catch(() => null));
  if (!user) return;

  await user.send({ embeds: [embed] }).catch(() => null);
}
