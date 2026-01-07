import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  EmbedBuilder,
  ChannelType,
  GuildMember,
  ModalBuilder,
  ModalSubmitInteraction,
  TextChannel,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { MessageFlags } from "discord-api-types/v10";
import { StateStore } from "../state/store";

function buildGuildControlsEmbed() {
  return new EmbedBuilder()
    .setTitle("Guild controls")
    .setColor(0x1f8b4c)
    .setDescription(
      [
        "Tools for Guild Leaders/Officers to manage their guild role.",
        "",
        "• Use `/ginvite user:<member> guild:<name>` to give your guild role to members.",
        "• Abuse (handing out guild roles broadly) can lead to moderation action.",
        "• Buttons below let you rename or delete your guild role.",
        "",
        "Requirements: you must have the server `Guild Leader` or `Guild Officer` role **and** your guild's role.",
      ].join("\n"),
    );
}

function guildControlsComponents() {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId("guildrole:rename").setLabel("Change guild name").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("guildrole:delete").setLabel("Delete guild").setStyle(ButtonStyle.Danger),
    ),
  ];
}

export async function upsertGuildControlsPanel(opts: { guild: import("discord.js").Guild; store: StateStore }) {
  const { guild, store } = opts;
  const gs = store.get().guilds[guild.id];
  const channelId = gs?.config.guildManagementChannelId;
  if (!channelId) return;

  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildText) return;
  const text = channel as TextChannel;

  const embed = buildGuildControlsEmbed();
  const messageId = gs?.config.guildManagementMessageId ?? null;
  if (messageId) {
    const msg = await text.messages.fetch(messageId).catch(() => null);
    if (msg) {
      await msg.edit({ embeds: [embed], components: guildControlsComponents() }).catch(() => null);
      return;
    }
  }

  const sent = await text.send({ embeds: [embed], components: guildControlsComponents() }).catch(() => null);
  if (!sent) return;

  await store.update(async (state) => {
    const g = state.guilds[guild.id];
    if (!g) return;
    g.config.guildManagementMessageId = sent.id;
  });
}

export async function ensureGuildRoleForName(opts: {
  guild: import("discord.js").Guild;
  store: StateStore;
  name: string;
  requestedByUserId: string;
}) {
  const { guild, store } = opts;
  const name = opts.name.trim();
  const lower = name.toLowerCase();
  const gs = store.get().guilds[guild.id];

  const existingEntry = gs?.guildRoles ? Object.values(gs.guildRoles).find((g) => g.name.toLowerCase() === lower) ?? null : null;
  const fromStoreRoleId = existingEntry?.roleId ?? null;
  let role =
    (fromStoreRoleId ? await guild.roles.fetch(fromStoreRoleId).catch(() => null) : null) ??
    guild.roles.cache.find((r) => r.name.toLowerCase() === lower) ??
    null;

  if (role) {
    if (role.name !== name) {
      await role.setName(name, "VerraVoice: ensure guild role name").catch(() => null);
    }
    if (role.mentionable) {
      await role.setMentionable(false, "VerraVoice: guild role should not be mentionable").catch(() => null);
    }
  } else {
    role = await guild.roles.create({ name, mentionable: false }).catch(() => null);
  }

  if (!role) throw new Error(`Failed to ensure guild role "${name}". Check bot permissions.`);

  const createdAtMs = existingEntry?.createdAtMs ?? Date.now();
  const renamedAtMs = existingEntry ? (existingEntry.name === name ? existingEntry.renamedAtMs : Date.now()) : null;

  await store.update(async (state) => {
    const g = state.guilds[guild.id];
    if (!g) return;
    g.guildRoles ??= {};
    // Remove stale entry keyed by old role id if the role id changed.
    if (existingEntry && existingEntry.roleId !== role!.id) {
      delete g.guildRoles[existingEntry.roleId];
    }
    g.guildRoles[role.id] = {
      roleId: role.id,
      name,
      createdByUserId: existingEntry?.createdByUserId ?? opts.requestedByUserId,
      createdAtMs,
      renamedAtMs,
    };
  });

  return { roleId: role.id, name };
}

function findGuildEntryByName(gs: ReturnType<StateStore["get"]>["guilds"][string] | undefined, name: string) {
  if (!gs) return null;
  const lower = name.toLowerCase();
  return Object.values(gs.guildRoles ?? {}).find((g) => g.name.toLowerCase() === lower) ?? null;
}

function memberHasRole(member: GuildMember, roleId: string | null | undefined) {
  return !!roleId && member.roles.cache.has(roleId);
}

export async function handleGuildRoleButtons(opts: { interaction: ButtonInteraction; store: StateStore }) {
  const { interaction, store } = opts;
  if (!interaction.inCachedGuild()) return;
  if (!interaction.customId.startsWith("guildrole:")) return;

  const action = interaction.customId.split(":")[1];
  if (action !== "delete" && action !== "rename") return;

  const modal = new ModalBuilder().setCustomId(`guildrolemodal:${action}`);
  const guildName = new TextInputBuilder()
    .setCustomId("guild_name")
    .setLabel("Guild name")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(80);

  if (action === "delete") {
    const confirm = new TextInputBuilder()
      .setCustomId("confirm")
      .setLabel('Type "DELETE" to confirm')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(10);
    modal.setTitle("Delete guild role").addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(guildName),
      new ActionRowBuilder<TextInputBuilder>().addComponents(confirm),
    );
  } else {
    const newName = new TextInputBuilder()
      .setCustomId("new_name")
      .setLabel("New guild name")
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(80);
    modal.setTitle("Change guild name").addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(guildName),
      new ActionRowBuilder<TextInputBuilder>().addComponents(newName),
    );
  }

  await interaction.showModal(modal);
}

export async function handleGuildRoleModals(opts: { interaction: ModalSubmitInteraction; store: StateStore }) {
  const { interaction, store } = opts;
  if (!interaction.inCachedGuild()) return;
  if (!interaction.customId.startsWith("guildrolemodal:")) return;

  const action = interaction.customId.split(":")[1];
  if (action !== "delete" && action !== "rename") return;

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
  const guildName = interaction.fields.getTextInputValue("guild_name").trim();
  if (!guildName) {
    await interaction.reply({ content: "Guild name is required.", flags: MessageFlags.Ephemeral });
    return;
  }

  const entry = findGuildEntryByName(gs, guildName);
  const member = interaction.member as GuildMember;

  const hasGuildRole = entry ? memberHasRole(member, entry.roleId) : false;
  const hasLeader = memberHasRole(member, leaderRoleId);
  const hasOfficer = memberHasRole(member, officerRoleId);

  if (!entry) {
    await interaction.reply({
      content: `No guild role found for **${guildName}**. If this is a new guild, request approval first.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (!hasGuildRole) {
    await interaction.reply({
      content: "You must have your guild's role to manage it.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (action === "delete") {
    if (!hasLeader) {
      await interaction.reply({
        content: "Only Guild Leaders with this guild's role can delete the guild role.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const confirm = interaction.fields.getTextInputValue("confirm").trim();
    if (confirm !== "DELETE") {
      await interaction.reply({ content: 'Deletion cancelled (type "DELETE" to confirm).', flags: MessageFlags.Ephemeral });
      return;
    }

    const role = await interaction.guild.roles.fetch(entry.roleId).catch(() => null);
    if (role) {
      await role.delete("VerraVoice: guild role deleted by guild leader").catch(() => null);
    }

    await store.update(async (state) => {
      const g = state.guilds[interaction.guildId];
      if (!g?.guildRoles) return;
      delete g.guildRoles[entry.roleId];
    });

    await interaction.reply({
      content: `Guild role **${entry.name}** deleted.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // rename
  if (!hasLeader && !hasOfficer) {
    await interaction.reply({
      content: "Only Guild Leaders or Guild Officers with this guild's role can rename it.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const newName = interaction.fields.getTextInputValue("new_name").trim();
  if (!newName) {
    await interaction.reply({ content: "New name is required.", flags: MessageFlags.Ephemeral });
    return;
  }

  const targetRole = await interaction.guild.roles.fetch(entry.roleId).catch(() => null);
  if (!targetRole) {
    await interaction.reply({
      content: "Guild role no longer exists. Request approval again or ask staff to recreate it.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const lower = newName.toLowerCase();
  const conflict =
    Object.values(gs.guildRoles ?? {}).find((g) => g.roleId !== entry.roleId && g.name.toLowerCase() === lower) ?? null;
  if (conflict) {
    await interaction.reply({
      content: `A guild role named **${newName}** already exists.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await targetRole.setName(newName, `VerraVoice: rename guild role from ${entry.name}`).catch(() => null);
  if (targetRole.mentionable) {
    await targetRole.setMentionable(false, "VerraVoice: guild role should not be mentionable").catch(() => null);
  }

  await store.update(async (state) => {
    const g = state.guilds[interaction.guildId];
    if (!g) return;
    g.guildRoles ??= {};
    g.guildRoles[entry.roleId] = {
      roleId: entry.roleId,
      name: newName,
      createdByUserId: entry.createdByUserId,
      createdAtMs: entry.createdAtMs,
      renamedAtMs: Date.now(),
    };
  });

  await interaction.reply({
    content: `Renamed guild role to **${newName}**.`,
    flags: MessageFlags.Ephemeral,
  });
}
