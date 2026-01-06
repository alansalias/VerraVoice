import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  ModalBuilder,
  ModalSubmitInteraction,
  PermissionFlagsBits,
  TextChannel,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { MessageFlags } from "discord-api-types/v10";
import { Logger } from "../../logger";
import { RoleRequest } from "../../state/schema";
import { StateStore } from "../../state/store";
import { newId } from "../../utils/ids";

function canReview(interaction: ButtonInteraction<"cached">) {
  const perms = interaction.memberPermissions;
  if (!perms) return false;
  return (
    perms.has(PermissionFlagsBits.Administrator) ||
    perms.has(PermissionFlagsBits.ManageGuild) ||
    perms.has(PermissionFlagsBits.ModerateMembers) ||
    perms.has(PermissionFlagsBits.ManageRoles)
  );
}

function roleLabel(type: RoleRequest["type"]) {
  return type === "guild_leader" ? "Guild Leader" : "Guild Officer";
}

function buildRoleRequestEmbed(opts: { requestId: string; type: RoleRequest["type"]; requesterUserId: string; guildName: string; note: string }) {
  return new EmbedBuilder()
    .setTitle(`Role request: ${roleLabel(opts.type)}`)
    .setColor(0x9b59b6)
    .addFields(
      { name: "Request ID", value: opts.requestId, inline: true },
      { name: "User", value: `<@${opts.requesterUserId}>`, inline: true },
      { name: "Guild", value: opts.guildName || "-", inline: true },
      { name: "Note", value: opts.note || "-" },
    )
    .setFooter({ text: "Approve/Deny using the buttons below." });
}

function reviewButtons(requestId: string) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`rolereq:approve:${requestId}`).setLabel("Approve").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`rolereq:deny:${requestId}`).setLabel("Deny").setStyle(ButtonStyle.Danger),
  );
}

function disabledReviewButtons(requestId: string) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`rolereq:approve:${requestId}`)
      .setLabel("Approve")
      .setStyle(ButtonStyle.Success)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`rolereq:deny:${requestId}`)
      .setLabel("Deny")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(true),
  );
}

export async function handleRoleRequestButtons(opts: {
  interaction: ButtonInteraction;
  store: StateStore;
  logger: Logger;
}) {
  const { interaction, store } = opts;
  if (!interaction.inCachedGuild()) return;
  if (!interaction.customId.startsWith("rolereq:")) return;

  const parts = interaction.customId.split(":");
  const action = parts[1];
  const tail = parts.slice(2).join(":");

  if (action === "open") {
    const type = tail === "guild_leader" || tail === "guild_officer" ? (tail as RoleRequest["type"]) : null;
    if (!type) return;

    const modal = new ModalBuilder().setCustomId(`rolereqmodal:${type}`).setTitle(`Request ${roleLabel(type)}`);
    const guildName = new TextInputBuilder()
      .setCustomId("guild_name")
      .setLabel("In-game guild name")
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(80);
    const note = new TextInputBuilder()
      .setCustomId("note")
      .setLabel("Short note for moderators")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setMaxLength(600);

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(guildName),
      new ActionRowBuilder<TextInputBuilder>().addComponents(note),
    );

    await interaction.showModal(modal);
    return;
  }

  if (action !== "approve" && action !== "deny") return;

  if (!canReview(interaction)) {
    await interaction.reply({ content: "You don't have permission to review these requests.", flags: MessageFlags.Ephemeral });
    return;
  }

  const requestId = tail;
  const gs = store.get().guilds[interaction.guildId];
  const req = gs?.roleRequests?.[requestId];
  if (!req) {
    await interaction.reply({ content: "Request not found.", flags: MessageFlags.Ephemeral });
    return;
  }
  if (req.status !== "pending") {
    await interaction.reply({ content: `Request is already ${req.status}.`, flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.deferUpdate();
  const now = Date.now();

  if (action === "deny") {
    await store.update(async (state) => {
      const r = state.guilds[interaction.guildId]?.roleRequests?.[requestId];
      if (!r) return;
      r.status = "denied";
      r.reviewedAtMs = now;
      r.reviewedByUserId = interaction.user.id;
    });
    await interaction.message.edit({
      content: `Status: **Denied** by <@${interaction.user.id}>.`,
      components: [disabledReviewButtons(requestId)],
      allowedMentions: { parse: [] },
    });
    return;
  }

  const roleName = roleLabel(req.type);
  const role = interaction.guild.roles.cache.find((r) => r.name.toLowerCase() === roleName.toLowerCase()) ?? null;
  if (!role) {
    await interaction.followUp({
      content: `Missing role \`${roleName}\`. Run \`/setup init\` again.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const member = await interaction.guild.members.fetch(req.requesterUserId).catch(() => null);
  if (member) await member.roles.add(role.id).catch(() => null);

  await store.update(async (state) => {
    const r = state.guilds[interaction.guildId]?.roleRequests?.[requestId];
    if (!r) return;
    r.status = "approved";
    r.reviewedAtMs = now;
    r.reviewedByUserId = interaction.user.id;
  });

  await interaction.message.edit({
    content: `Status: **Approved** by <@${interaction.user.id}>.`,
    components: [disabledReviewButtons(requestId)],
    allowedMentions: { parse: [] },
  });
}

export async function handleRoleRequestModal(opts: {
  interaction: ModalSubmitInteraction;
  store: StateStore;
  logger: Logger;
}) {
  const { interaction, store } = opts;
  if (!interaction.inCachedGuild()) return;
  if (!interaction.customId.startsWith("rolereqmodal:")) return;

  const type = interaction.customId.split(":")[1] as RoleRequest["type"] | undefined;
  if (type !== "guild_leader" && type !== "guild_officer") return;

  const gs = store.get().guilds[interaction.guildId];
  if (!gs) {
    await interaction.reply({
      content: "Server is not initialized. Ask an admin to run `/setup init`.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const guildName = interaction.fields.getTextInputValue("guild_name").trim();
  const note = interaction.fields.getTextInputValue("note").trim();
  if (!guildName || !note) {
    await interaction.reply({ content: "Guild name and note are required.", flags: MessageFlags.Ephemeral });
    return;
  }

  const requestId = newId("rolereq");
  const createdAtMs = Date.now();
  const req: RoleRequest = {
    id: requestId,
    type,
    requesterUserId: interaction.user.id,
    guildName,
    note,
    status: "pending",
    createdAtMs,
    reviewedAtMs: null,
    reviewedByUserId: null,
  };

  await store.update(async (state) => {
    const g = state.guilds[interaction.guildId];
    if (!g) return;
    g.roleRequests[requestId] = req;
  });

  const requestsChannelId = store.get().guilds[interaction.guildId]?.config?.requestsChannelId;
  if (requestsChannelId) {
    const chan = await interaction.guild.channels.fetch(requestsChannelId).catch(() => null);
    if (chan && chan.type === ChannelType.GuildText) {
      await (chan as TextChannel)
        .send({
          embeds: [buildRoleRequestEmbed({ requestId, type, requesterUserId: interaction.user.id, guildName, note })],
          components: [reviewButtons(requestId)],
          allowedMentions: { parse: [] },
        })
        .catch(() => null);
    }
  }

  await interaction.reply({
    content: `Request submitted (**${requestId}**). A moderator will review it.`,
    flags: MessageFlags.Ephemeral,
  });
}
