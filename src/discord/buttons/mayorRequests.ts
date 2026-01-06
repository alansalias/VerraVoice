import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChannelType,
  PermissionFlagsBits,
  TextChannel,
} from "discord.js";
import { MessageFlags } from "discord-api-types/v10";
import { buildSettlementCard } from "../embeds/settlementCard";
import { upsertGuildOverview } from "../overview";
import { Settlement } from "../../state/schema";
import { StateStore } from "../../state/store";
import { Logger } from "../../logger";
import { allSettlementMayorRoleIds, getOrCreateMayorAggregateRoleId, syncMayorAggregateForMember } from "../mayorAggregate";
import { dmMayorWelcome } from "../mayorDm";

function disableReviewButtons(requestId: string) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`mayorreq:approve:${requestId}`)
      .setLabel("Approve")
      .setStyle(ButtonStyle.Success)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`mayorreq:deny:${requestId}`)
      .setLabel("Deny")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(true),
  );
}

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

function findSettlement(guildState: any, input: string): Settlement | null {
  const byId = guildState?.settlements?.[input];
  if (byId) return byId;
  const lower = input.toLowerCase();
  for (const settlement of Object.values(guildState?.settlements ?? {}) as Settlement[]) {
    if (settlement.name.toLowerCase() === lower) return settlement;
  }
  return null;
}

async function setMayorRole(opts: { guild: any; store: StateStore; settlement: Settlement; newMayorUserId: string | null }) {
  const { guild, store, settlement, newMayorUserId } = opts;
  if (!settlement.mayorRoleId) return;
  const roleId = settlement.mayorRoleId;

  const mayorAggregateRoleId = await getOrCreateMayorAggregateRoleId(store, guild);
  const settlementMayorRoleIds = allSettlementMayorRoleIds(store, guild.id);

  let prevMember: any | null = null;
  let newMember: any | null = null;

  if (settlement.mayorUserId) {
    prevMember = await guild.members.fetch(settlement.mayorUserId).catch(() => null);
    if (prevMember) await prevMember.roles.remove(roleId).catch(() => null);
  }

  if (newMayorUserId) {
    newMember = await guild.members.fetch(newMayorUserId).catch(() => null);
    if (newMember) await newMember.roles.add(roleId).catch(() => null);
  }

  if (mayorAggregateRoleId) {
    if (prevMember) {
      await syncMayorAggregateForMember({ member: prevMember, mayorAggregateRoleId, settlementMayorRoleIds });
    }
    if (newMember) {
      await syncMayorAggregateForMember({ member: newMember, mayorAggregateRoleId, settlementMayorRoleIds });
    }
  }
}

async function upsertSettlementStatusCard(opts: { guild: any; settlement: Settlement; store: StateStore }) {
  if (!opts.settlement.channelId) return;
  const channel = await opts.guild.channels.fetch(opts.settlement.channelId).catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildText) return;
  const text = channel as TextChannel;

  const embed = buildSettlementCard(opts.settlement);
  if (opts.settlement.statusCardMessageId) {
    const msg = await text.messages.fetch(opts.settlement.statusCardMessageId).catch(() => null);
    if (msg) {
      await msg.edit({ embeds: [embed] }).catch(() => null);
      if (!msg.pinned) await msg.pin().catch(() => null);
      return;
    }
  }
  const msg = await text.send({ embeds: [embed] }).catch(() => null);
  if (!msg) return;
  if (!msg.pinned) await msg.pin().catch(() => null);
  await opts.store.update(async (state) => {
    const s = state.guilds[opts.guild.id]?.settlements?.[opts.settlement.id];
    if (!s) return;
    s.statusCardMessageId = msg.id;
  });
}

export async function handleMayorRequestButtons(opts: {
  interaction: ButtonInteraction;
  store: StateStore;
  logger: Logger;
}) {
  const { interaction, store } = opts;
  if (!interaction.inCachedGuild()) return;
  if (!interaction.customId.startsWith("mayorreq:")) return;

  const parts = interaction.customId.split(":");
  const action = parts[1];
  const requestId = parts.slice(2).join(":");
  if (!requestId) return;

  if (!canReview(interaction)) {
    await interaction.reply({
      content: "You don't have permission to approve/deny mayor requests.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const guild = interaction.guild;
  const guildState = store.get().guilds[guild.id];
  if (!guildState) {
    await interaction.reply({ content: "Run `/setup init` first.", flags: MessageFlags.Ephemeral });
    return;
  }

  const req = guildState.mayorRequests?.[requestId];
  if (!req) {
    await interaction.reply({ content: "Request not found (it may have been deleted).", flags: MessageFlags.Ephemeral });
    return;
  }
  if (req.status !== "pending") {
    await interaction.reply({ content: `Request is already ${req.status}.`, flags: MessageFlags.Ephemeral });
    return;
  }

  const settlement = findSettlement(guildState, req.settlementId);
  if (!settlement) {
    await interaction.reply({ content: "Settlement no longer exists.", flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.deferUpdate();

  const now = Date.now();
  if (action === "deny") {
    await store.update(async (state) => {
      const r = state.guilds[guild.id]?.mayorRequests?.[requestId];
      if (!r) return;
      r.status = "denied";
      r.reviewedAtMs = now;
      r.reviewedByUserId = interaction.user.id;
    });

    await interaction.message.edit({
      content: `Status: **Denied** by <@${interaction.user.id}>.`,
      components: [disableReviewButtons(requestId)],
      allowedMentions: { parse: [] },
    });
    return;
  }

  if (action !== "approve") return;

  await setMayorRole({ guild, store, settlement, newMayorUserId: req.requesterUserId });
  const termMs = 30 * 24 * 60 * 60 * 1000;

  await store.update(async (state) => {
    const gs = state.guilds[guild.id];
    if (!gs) return;
    const s = gs.settlements[settlement.id];
    if (!s) return;
    s.mayorUserId = req.requesterUserId;
    s.mayorGuildName = req.guildName?.trim() ? req.guildName.trim() : null;
    s.mayorSinceMs = now;
    s.mayorUntilMs = now + termMs;
    s.updatedAtMs = now;
    const r = gs.mayorRequests[requestId];
    if (r) {
      r.status = "approved";
      r.reviewedAtMs = now;
      r.reviewedByUserId = interaction.user.id;
    }
  });

  const announcementsChannelId = store.get().guilds[guild.id]?.config?.announcementsChannelId;
  if (announcementsChannelId) {
    const chan = await guild.channels.fetch(announcementsChannelId).catch(() => null);
    if (chan && chan.type === ChannelType.GuildText) {
      await (chan as TextChannel)
        .send({
          content: `New mayor for **${settlement.name}**: <@${req.requesterUserId}> (term ends <t:${Math.floor((now + termMs) / 1000)}:D>).`,
          allowedMentions: { parse: [] },
        })
        .catch(() => null);
    }
  }

  const updatedSettlement = store.get().guilds[guild.id]?.settlements?.[settlement.id] as Settlement | undefined;
  if (updatedSettlement) {
    await upsertSettlementStatusCard({ guild, settlement: updatedSettlement, store });
  }
  await upsertGuildOverview(guild, store);
  await dmMayorWelcome({ guild, store, mayorUserId: req.requesterUserId, settlementId: settlement.id });

  await interaction.message.edit({
    content: `Status: **Approved** by <@${interaction.user.id}>.`,
    components: [disableReviewButtons(requestId)],
    allowedMentions: { parse: [] },
  });
}
