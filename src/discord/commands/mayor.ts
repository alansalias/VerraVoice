import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, EmbedBuilder, TextChannel } from "discord.js";
import { MessageFlags } from "discord-api-types/v10";
import { MayorRequest, Settlement } from "../../state/schema";
import { newId } from "../../utils/ids";
import { buildSettlementCard } from "../embeds/settlementCard";
import { upsertGuildOverview } from "../overview";
import { canReviewMayorRequests, requireGuild } from "../permissions";
import { allSettlementMayorRoleIds, getOrCreateMayorAggregateRoleId, syncMayorAggregateForMember } from "../mayorAggregate";
import { dmMayorWelcome } from "../mayorDm";
import { CommandHandler } from "./types";

function findSettlement(guildState: any, input: string): Settlement | null {
  const byId = guildState?.settlements?.[input];
  if (byId) return byId;
  const lower = input.toLowerCase();
  for (const settlement of Object.values(guildState?.settlements ?? {}) as Settlement[]) {
    if (settlement.name.toLowerCase() === lower) return settlement;
  }
  return null;
}

async function updateSettlementCard(interaction: any, settlement: Settlement) {
  if (!settlement.channelId) return;
  const channel = await interaction.guild.channels.fetch(settlement.channelId).catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildText) return;
  const text = channel as TextChannel;
  const embed = buildSettlementCard(settlement);
  if (settlement.statusCardMessageId) {
    const msg = await text.messages.fetch(settlement.statusCardMessageId).catch(() => null);
    if (msg) {
      await msg.edit({ embeds: [embed] });
      if (!msg.pinned) await msg.pin().catch(() => null);
      return;
    }
  }
  const msg = await text.send({ embeds: [embed] });
  if (!msg.pinned) await msg.pin().catch(() => null);
  settlement.statusCardMessageId = msg.id;
}

async function setMayorRole(opts: {
  guild: any;
  store: import("../../state/store").StateStore;
  settlement: Settlement;
  newMayorUserId: string | null;
}) {
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

function buildReviewButtons(requestId: string) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`mayorreq:approve:${requestId}`)
      .setLabel("Approve")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`mayorreq:deny:${requestId}`)
      .setLabel("Deny")
      .setStyle(ButtonStyle.Danger),
  );
}

function buildMayorRequestEmbed(opts: {
  requestId: string;
  settlementName: string;
  requesterUserId: string;
  guildName: string;
  note: string;
  proofUrl: string;
}) {
  return new EmbedBuilder()
    .setTitle(`Mayor claim: ${opts.settlementName}`)
    .setColor(0xf1c40f)
    .addFields(
      { name: "Request ID", value: opts.requestId, inline: true },
      { name: "User", value: `<@${opts.requesterUserId}>`, inline: true },
      { name: "Guild", value: opts.guildName, inline: true },
      { name: "Note", value: opts.note },
    )
    .setImage(opts.proofUrl)
    .setFooter({ text: "Approve/Deny using the buttons below." });
}

export const handleMayor: CommandHandler = async ({ interaction, store }) => {
  if (interaction.commandName !== "mayor") return;
  requireGuild(interaction);
  const sub = interaction.options.getSubcommand();
  const guild = interaction.guild;
  const guildState = store.get().guilds[guild.id];
  if (!guildState) {
    await interaction.reply({ content: "Run `/setup init` first.", flags: MessageFlags.Ephemeral });
    return;
  }

  if (sub === "claim") {
    const settlementInput = interaction.options.getString("settlement", true);
    const settlement = findSettlement(guildState, settlementInput);
    if (!settlement) {
      await interaction.reply({ content: "Settlement not found.", flags: MessageFlags.Ephemeral });
      return;
    }

    const proof = interaction.options.getAttachment("proof", true);
    const guildName = interaction.options.getString("guild_name", true).trim();
    const note = interaction.options.getString("note", true).trim();

    const isImage =
      (proof.contentType && proof.contentType.startsWith("image/")) ||
      /\.(png|jpe?g|gif|webp)$/i.test(proof.url);
    if (!isImage) {
      await interaction.reply({
        content: "Proof must be an image upload (png/jpg/gif/webp).",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    if (!guildName) {
      await interaction.reply({ content: "Guild name is required.", flags: MessageFlags.Ephemeral });
      return;
    }
    if (!note) {
      await interaction.reply({ content: "Note is required.", flags: MessageFlags.Ephemeral });
      return;
    }
    if (note.length > 600) {
      await interaction.reply({ content: "Note is too long (max ~600 chars).", flags: MessageFlags.Ephemeral });
      return;
    }

    const requestId = newId("mayorreq");
    const createdAtMs = Date.now();

    await store.update(async (state) => {
      const gs = state.guilds[guild.id];
      if (!gs) return;
      const req: MayorRequest = {
        id: requestId,
        settlementId: settlement.id,
        requesterUserId: interaction.user.id,
        guildName,
        note,
        proofUrl: proof.url,
        proofFilename: proof.name ?? null,
        proofContentType: proof.contentType ?? null,
        proofSize: proof.size ?? null,
        status: "pending",
        createdAtMs,
        reviewedAtMs: null,
        reviewedByUserId: null,
      };
      gs.mayorRequests[requestId] = req;
    });

    const requestsChannelId = store.get().guilds[guild.id]?.config?.requestsChannelId;
    if (!requestsChannelId) {
      await interaction.reply({
        content: "Requests channel is not configured. Run `/setup init` again.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const chan = await guild.channels.fetch(requestsChannelId).catch(() => null);
    if (!chan || chan.type !== ChannelType.GuildText) {
      await interaction.reply({
        content: "Requests channel is missing. Run `/setup init` again.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    await (chan as TextChannel)
      .send({
        embeds: [
          buildMayorRequestEmbed({
            requestId,
            settlementName: settlement.name,
            requesterUserId: interaction.user.id,
            guildName,
            note,
            proofUrl: proof.url,
          }),
        ],
        components: [buildReviewButtons(requestId)],
        allowedMentions: { parse: [] },
      })
      .catch(() => null);

    await interaction.reply({
      content: `Request submitted (**${requestId}**). A moderator will review it.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (sub === "approve" || sub === "deny") {
    if (!canReviewMayorRequests(interaction)) {
      await interaction.reply({
        content: "You need moderation permissions (Manage Server / Moderate Members / Manage Roles) to review requests.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const requestId = interaction.options.getString("request_id", true);
    const req = store.get().guilds[guild.id]?.mayorRequests?.[requestId];
    if (!req) {
      await interaction.reply({ content: "Request not found.", flags: MessageFlags.Ephemeral });
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

    if (sub === "deny") {
      await store.update(async (state) => {
        const r = state.guilds[guild.id]?.mayorRequests?.[requestId];
        if (!r) return;
        r.status = "denied";
        r.reviewedAtMs = Date.now();
        r.reviewedByUserId = interaction.user.id;
      });
      await interaction.reply({ content: `Denied request **${requestId}**.`, flags: MessageFlags.Ephemeral });
      return;
    }

    await setMayorRole({ guild, store, settlement, newMayorUserId: req.requesterUserId });
    const now = Date.now();
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

    const updated = store.get().guilds[guild.id]?.settlements?.[settlement.id] as Settlement | undefined;
    if (updated) await updateSettlementCard(interaction, updated);
    await upsertGuildOverview(guild, store);
    await dmMayorWelcome({ guild, store, mayorUserId: req.requesterUserId, settlementId: settlement.id });

    const announcementsChannelId = store.get().guilds[guild.id]?.config?.announcementsChannelId;
    if (announcementsChannelId) {
      const chan = await guild.channels.fetch(announcementsChannelId).catch(() => null);
      if (chan && chan.type === ChannelType.GuildText) {
        await (chan as TextChannel).send(
          `New mayor for **${settlement.name}**: <@${req.requesterUserId}> (term ends <t:${Math.floor((now + termMs) / 1000)}:D>).`,
        );
      }
    }

    await interaction.reply({
      content: `Approved request **${requestId}** and assigned mayor role.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (sub === "assign") {
    if (!canReviewMayorRequests(interaction)) {
      await interaction.reply({
        content: "You need moderation permissions (Manage Server / Moderate Members / Manage Roles) to assign mayors.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const settlementInput = interaction.options.getString("settlement", true);
    const user = interaction.options.getUser("user", true);
    const settlement = findSettlement(guildState, settlementInput);
    if (!settlement) {
      await interaction.reply({ content: "Settlement not found.", flags: MessageFlags.Ephemeral });
      return;
    }

    await setMayorRole({ guild, store, settlement, newMayorUserId: user.id });
    const now = Date.now();
    const termMs = 30 * 24 * 60 * 60 * 1000;

    await store.update(async (state) => {
      const s = state.guilds[guild.id]?.settlements?.[settlement.id];
      if (!s) return;
      s.mayorUserId = user.id;
      s.mayorGuildName = null;
      s.mayorSinceMs = now;
      s.mayorUntilMs = now + termMs;
      s.updatedAtMs = now;
    });

    const updated = store.get().guilds[guild.id]?.settlements?.[settlement.id] as Settlement | undefined;
    if (updated) await updateSettlementCard(interaction, updated);
    await upsertGuildOverview(guild, store);
    await dmMayorWelcome({ guild, store, mayorUserId: user.id, settlementId: settlement.id });

    await interaction.reply({
      content: `Mayor for **${settlement.name}** set to <@${user.id}>.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (sub === "clear") {
    if (!canReviewMayorRequests(interaction)) {
      await interaction.reply({
        content: "You need moderation permissions (Manage Server / Moderate Members / Manage Roles) to clear mayors.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const settlementInput = interaction.options.getString("settlement", true);
    const settlement = findSettlement(guildState, settlementInput);
    if (!settlement) {
      await interaction.reply({ content: "Settlement not found.", flags: MessageFlags.Ephemeral });
      return;
    }

    await setMayorRole({ guild, store, settlement, newMayorUserId: null });

    await store.update(async (state) => {
      const s = state.guilds[guild.id]?.settlements?.[settlement.id];
      if (!s) return;
      s.mayorUserId = null;
      s.mayorGuildName = null;
      s.mayorSinceMs = null;
      s.mayorUntilMs = null;
      s.updatedAtMs = Date.now();
    });

    const updated = store.get().guilds[guild.id]?.settlements?.[settlement.id] as Settlement | undefined;
    if (updated) await updateSettlementCard(interaction, updated);
    await upsertGuildOverview(guild, store);

    await interaction.reply({ content: `Cleared mayor for **${settlement.name}**.`, flags: MessageFlags.Ephemeral });
    return;
  }
};
