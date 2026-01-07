import { MessageFlags } from "discord-api-types/v10";
import { CommandHandler } from "./types";
import { requireGuild } from "../permissions";

export const handleGuildInvite: CommandHandler = async ({ interaction, store }) => {
  if (interaction.commandName !== "ginvite") return;
  requireGuild(interaction);

  const targetUser = interaction.options.getUser("user", true);
  const guildNameInput = interaction.options.getString("guild")?.trim() ?? null;

  const gs = store.get().guilds[interaction.guildId];
  if (!gs) {
    await interaction.reply({
      content: "Server is not initialized. Ask an admin to run `/setup init`.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const config = gs.config;
  const leaderRoleId = config.guildLeaderRoleId;
  const officerRoleId = config.guildOfficerRoleId;
  if (!leaderRoleId && !officerRoleId) {
    await interaction.reply({
      content: "Guild roles are not configured. Run `/setup init` first.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const caller = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  if (!caller) {
    await interaction.reply({ content: "Could not verify your roles.", flags: MessageFlags.Ephemeral });
    return;
  }

  const hasLeader = leaderRoleId ? caller.roles.cache.has(leaderRoleId) : false;
  const hasOfficer = officerRoleId ? caller.roles.cache.has(officerRoleId) : false;
  if (!hasLeader && !hasOfficer) {
    await interaction.reply({
      content: "Only Guild Leaders or Guild Officers can use this.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const guildEntries = Object.values(gs.guildRoles ?? {});
  const myEntries = guildEntries.filter((g) => caller.roles.cache.has(g.roleId));

  let entry =
    guildNameInput !== null
      ? guildEntries.find((g) => g.name.toLowerCase() === guildNameInput.toLowerCase()) ?? null
      : myEntries.length === 1
        ? myEntries[0]
        : null;

  if (guildNameInput && entry && !caller.roles.cache.has(entry.roleId)) {
    entry = null;
  }

  if (!entry) {
    const names =
      myEntries.length > 0
        ? `You currently have: ${myEntries.map((g) => `**${g.name}**`).join(", ")}.`
        : "You do not have any guild roles assigned.";
    await interaction.reply({
      content:
        "Tell me which guild to invite to.\n" +
        "- Use the `guild` option (exact guild name) if you have multiple guild roles.\n" +
        `- ${names}`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const role = await interaction.guild.roles.fetch(entry.roleId).catch(() => null);
  if (!role) {
    await interaction.reply({
      content: `Guild role for **${entry.name}** is missing. Ask staff to recreate it (approve the guild leader request again).`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
  if (!targetMember) {
    await interaction.reply({
      content: "That user is not in this server.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await targetMember.roles.add(role.id).catch(() => null);

  await interaction.reply({
    content: `Added <@&${role.id}> to <@${targetUser.id}>.`,
    flags: MessageFlags.Ephemeral,
  });
};
