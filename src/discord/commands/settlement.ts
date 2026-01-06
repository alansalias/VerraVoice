import {
  ChannelType,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  TextChannel,
} from "discord.js";
import { MessageFlags } from "discord-api-types/v10";
import { Settlement, SettlementTierSchema } from "../../state/schema";
import { buildSettlementCard } from "../embeds/settlementCard";
import { upsertGuildOverview } from "../overview";
import { canManageSettlement, isAdmin, requireGuild } from "../permissions";
import { tierName } from "../tiers";
import { newId } from "../../utils/ids";
import { slugify } from "../../utils/strings";
import { CommandHandler } from "./types";
import { moderatorRoleIds } from "../moderationRoles";
import { allSettlementMayorRoleIds, getOrCreateMayorAggregateRoleId, syncMayorAggregateForMember } from "../mayorAggregate";

function mustGetGuildState(store: { get: () => any }, guildId: string) {
  const guildState = store.get().guilds[guildId];
  if (!guildState) throw new Error("This server is not initialized. Run /setup init first.");
  return guildState;
}

function findSettlementByIdOrName(guildState: any, input: string): Settlement | null {
  const byId = guildState.settlements?.[input];
  if (byId) return byId;
  const lower = input.toLowerCase();
  for (const settlement of Object.values(guildState.settlements ?? {}) as Settlement[]) {
    if (settlement.name.toLowerCase() === lower) return settlement;
  }
  return null;
}

async function upsertStatusCard(interaction: ChatInputCommandInteraction<"cached">, settlement: Settlement) {
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

export const handleSettlement: CommandHandler = async ({ interaction, store }) => {
  if (interaction.commandName !== "settlement") return;
  requireGuild(interaction);
  const sub = interaction.options.getSubcommand();
  const guild = interaction.guild;
  const admin = isAdmin(interaction);

  if (sub === "add") {
    if (!admin) {
      await interaction.reply({
        content: "You need Manage Server (or Administrator) to add settlements.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const name = interaction.options.getString("name", true).trim();
    const now = Date.now();

    let createdId: string | null = null;

    await store.update(async (state) => {
      const guildState = (state.guilds[guild.id] ??= {
        config: {
          timezone: "UTC",
          settlementsCategoryId: null,
          moderationCategoryId: null,
          announcementsChannelId: null,
          adminRoleId: null,
          moderatorRoleId: null,
          mayorAggregateRoleId: null,
          mayorHowToChannelId: null,
          mayorHowToMessageId: null,
          adminChatChannelId: null,
          moderatorChatChannelId: null,
          allMayorsChannelId: null,
          guildLeadershipChannelId: null,
          infoCategoryId: null,
          generalCategoryId: null,
          serverAnnouncementsChannelId: null,
          rulesChannelId: null,
          rulesMessageId: null,
          selfAssignChannelId: null,
          selfAssignMessageId: null,
          mayorInfoChannelId: null,
          mayorInfoMessageId: null,
          requestsChannelId: null,
          overviewChannelId: null,
          overviewMessageId: null,
          zoneMayorChannelIds: {},
          zoneViewRoleIds: {},
        },
        settlements: {},
        mayorRequests: {},
        roleRequests: {},
        schedule: {},
      });

      if (!guildState.config.settlementsCategoryId) {
        throw new Error("Run /setup init first (missing Settlements category).");
      }

      let idBase = slugify(name);
      if (!idBase) idBase = newId("settlement");
      let id = idBase;
      let i = 2;
      while (guildState.settlements[id]) {
        id = `${idBase}-${i++}`;
      }

      createdId = id;
      guildState.settlements[id] = {
        id,
        name,
        zone: "",
        tier: 0,
        mayorUserId: null,
        mayorGuildName: null,
        mayorSinceMs: null,
        mayorUntilMs: null,
        mayorRoleId: null,
        citizenRoleId: null,
        viewRoleId: null,
        channelId: null,
        statusCardMessageId: null,
        buildings: "",
        buyOrders: "",
        notes: "",
        election: { registrationStartMs: null, votingStartMs: null, votingEndMs: null, scheduleItemIds: [] },
        createdAtMs: now,
        updatedAtMs: now,
      };
    });

    const guildState = mustGetGuildState(store, guild.id);
    const settlement = createdId ? findSettlementByIdOrName(guildState, createdId) : null;
    if (!settlement) throw new Error("Failed to create settlement.");

    const mayorRole = await guild.roles.create({ name: `Mayor of ${settlement.name}` });
    const citizenRole = await guild.roles.create({ name: `${settlement.name} Citizens`, mentionable: false });
    const viewRole = await guild.roles.create({ name: `View ${settlement.name}`, mentionable: false });
    const botMember = guild.members.me ?? (await guild.members.fetchMe());
    const botId = botMember.id;
    const modRoleIds = moderatorRoleIds(guild);

    const channel = await guild.channels.create({
      name: settlement.id,
      type: ChannelType.GuildText,
      parent: guildState.config.settlementsCategoryId ?? undefined,
      topic: `Settlement: ${settlement.name}`,
      permissionOverwrites: [
        {
          id: guild.roles.everyone.id,
          deny: [PermissionFlagsBits.ViewChannel],
        },
        { id: citizenRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
        { id: viewRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] },
        { id: mayorRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
        ...modRoleIds.map((id) => ({
          id,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
        })),
        {
          id: botId,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.EmbedLinks,
            PermissionFlagsBits.ReadMessageHistory,
          ],
        },
      ],
    });

    await store.update(async (state) => {
      const gs = state.guilds[guild.id];
      if (!gs) return;
      const s = gs.settlements[settlement.id];
      if (!s) return;
      s.mayorRoleId = mayorRole.id;
      s.citizenRoleId = citizenRole.id;
      s.viewRoleId = viewRole.id;
      s.channelId = channel.id;
      s.updatedAtMs = Date.now();
    });

    const updated = findSettlementByIdOrName(mustGetGuildState(store, guild.id), settlement.id);
    if (updated) await upsertStatusCard(interaction, updated);
    await upsertGuildOverview(guild, store);

    await interaction.editReply(
      `Created settlement **${settlement.name}**.\n- Channel: <#${channel.id}>\n- Mayor role: <@&${mayorRole.id}>`,
    );
    return;
  }

  if (sub === "list") {
    const guildState = store.get().guilds[guild.id];
    const settlements = Object.values(guildState?.settlements ?? {}) as Settlement[];
    if (!settlements.length) {
      await interaction.reply({ content: "No settlements yet. Use `/settlement add`.", flags: MessageFlags.Ephemeral });
      return;
    }
    const lines = settlements
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(
        (s) =>
          `- ${s.name}: tier ${s.tier} (${tierName(s.tier)}), mayor ${s.mayorUserId ? `<@${s.mayorUserId}>` : "-"}`,
      );
    await interaction.reply({ content: lines.join("\n"), flags: MessageFlags.Ephemeral });
    return;
  }

  if (sub === "info") {
    const guildState = store.get().guilds[guild.id];
    if (!guildState) {
      await interaction.reply({ content: "Run `/setup init` first.", flags: MessageFlags.Ephemeral });
      return;
    }
    const input = interaction.options.getString("settlement", true);
    const settlement = findSettlementByIdOrName(guildState, input);
    if (!settlement) {
      await interaction.reply({ content: "Settlement not found.", flags: MessageFlags.Ephemeral });
      return;
    }
    const content = [
      `**${settlement.name}**`,
      `- Tier: ${settlement.tier} (${tierName(settlement.tier)})`,
      `- Mayor: ${settlement.mayorUserId ? `<@${settlement.mayorUserId}>` : "-"}`,
      settlement.channelId ? `- Channel: <#${settlement.channelId}>` : null,
    ]
      .filter(Boolean)
      .join("\n");
    await interaction.reply({ content, flags: MessageFlags.Ephemeral });
    return;
  }

  if (sub === "set-tier") {
    const input = interaction.options.getString("settlement", true);
    const tier = interaction.options.getInteger("tier", true);
    const parsedTier = SettlementTierSchema.safeParse(tier);
    if (!parsedTier.success) {
      await interaction.reply({ content: "Tier must be 0..5.", flags: MessageFlags.Ephemeral });
      return;
    }

    const guildState = store.get().guilds[guild.id];
    if (!guildState) {
      await interaction.reply({ content: "Run `/setup init` first.", flags: MessageFlags.Ephemeral });
      return;
    }
    const settlement = findSettlementByIdOrName(guildState, input);
    if (!settlement) {
      await interaction.reply({ content: "Settlement not found.", flags: MessageFlags.Ephemeral });
      return;
    }
    if (!canManageSettlement(interaction.member, settlement, admin)) {
      await interaction.reply({
        content: "Only the settlement mayor (or an admin) can set tiers for this settlement.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const oldTier = settlement.tier;
    await store.update(async (state) => {
      const s = state.guilds[guild.id]?.settlements[settlement.id];
      if (!s) return;
      s.tier = parsedTier.data;
      s.updatedAtMs = Date.now();
    });

    const updated = findSettlementByIdOrName(mustGetGuildState(store, guild.id), settlement.id);
    if (updated) await upsertStatusCard(interaction, updated);
    await upsertGuildOverview(guild, store);

    await interaction.reply({
      content: `Updated **${settlement.name}** tier: ${oldTier} -> ${parsedTier.data} (${tierName(parsedTier.data)}).`,
      flags: MessageFlags.Ephemeral,
    });

    const announcementsChannelId = store.get().guilds[guild.id]?.config?.announcementsChannelId;
    if (announcementsChannelId && updated) {
      const chan = await guild.channels.fetch(announcementsChannelId).catch(() => null);
      if (chan && chan.type === ChannelType.GuildText) {
        await (chan as TextChannel).send(
          `Settlement **${updated.name}** is now tier **${updated.tier}** (${tierName(updated.tier)}).`,
        );
      }
    }
    return;
  }

  if (sub === "update") {
    const guildState = store.get().guilds[guild.id];
    if (!guildState) {
      await interaction.reply({ content: "Run `/setup init` first.", flags: MessageFlags.Ephemeral });
      return;
    }
    const input = interaction.options.getString("settlement", true);
    const settlement = findSettlementByIdOrName(guildState, input);
    if (!settlement) {
      await interaction.reply({ content: "Settlement not found.", flags: MessageFlags.Ephemeral });
      return;
    }
    const member = interaction.member;
    if (!canManageSettlement(member, settlement, admin)) {
      await interaction.reply({ content: "Only the settlement mayor (or an admin) can update this.", flags: MessageFlags.Ephemeral });
      return;
    }

    const buildings = interaction.options.getString("buildings", false);
    const buyOrders = interaction.options.getString("buy_orders", false);
    const notes = interaction.options.getString("notes", false);

    if (!buildings && !buyOrders && !notes) {
      await interaction.reply({ content: "Provide at least one field to update.", flags: MessageFlags.Ephemeral });
      return;
    }

    await store.update(async (state) => {
      const s = state.guilds[guild.id]?.settlements[settlement.id];
      if (!s) return;
      if (typeof buildings === "string") s.buildings = buildings;
      if (typeof buyOrders === "string") s.buyOrders = buyOrders;
      if (typeof notes === "string") s.notes = notes;
      s.updatedAtMs = Date.now();
    });

    const updated = findSettlementByIdOrName(mustGetGuildState(store, guild.id), settlement.id);
    if (updated) await upsertStatusCard(interaction, updated);
    await upsertGuildOverview(guild, store);

    await interaction.reply({ content: `Updated **${settlement.name}** status card.`, flags: MessageFlags.Ephemeral });
    return;
  }

  if (sub === "announce") {
    const guildState = store.get().guilds[guild.id];
    if (!guildState) {
      await interaction.reply({ content: "Run `/setup init` first.", flags: MessageFlags.Ephemeral });
      return;
    }
    const input = interaction.options.getString("settlement", true);
    const message = interaction.options.getString("message", true).trim();
    const pingCitizens = interaction.options.getBoolean("ping_citizens") ?? true;

    const settlement = findSettlementByIdOrName(guildState, input);
    if (!settlement) {
      await interaction.reply({ content: "Settlement not found.", flags: MessageFlags.Ephemeral });
      return;
    }

    const member = interaction.member;
    if (!canManageSettlement(member, settlement, admin)) {
      await interaction.reply({
        content: "Only the settlement mayor (or an admin) can announce for this settlement.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const targetChannelId = settlement.channelId ?? guildState.config.announcementsChannelId ?? interaction.channelId;
    if (!targetChannelId) {
      await interaction.reply({
        content: "No announce channel configured. Run `/setup init` first.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const targetChannel = await guild.channels.fetch(targetChannelId).catch(() => null);
    if (!targetChannel || targetChannel.type !== ChannelType.GuildText) {
      await interaction.reply({ content: "Announcement channel is missing or not a text channel.", flags: MessageFlags.Ephemeral });
      return;
    }

    let content = message;
    let allowedRoleId: string | null = null;

    if (pingCitizens && settlement.citizenRoleId) {
      const role = await guild.roles.fetch(settlement.citizenRoleId).catch(() => null);
      if (role) {
        allowedRoleId = role.id;
        content = `<@&${role.id}> ${message}`;
      }
    }

    await (targetChannel as TextChannel).send({
      content,
      allowedMentions: allowedRoleId ? { roles: [allowedRoleId] } : { parse: [] },
    });

    await interaction.reply({ content: `Announcement sent in <#${targetChannelId}>.`, flags: MessageFlags.Ephemeral });
    return;
  }

  if (sub === "destroyed") {
    const guildState = store.get().guilds[guild.id];
    if (!guildState) {
      await interaction.reply({ content: "Run `/setup init` first.", flags: MessageFlags.Ephemeral });
      return;
    }
    const input = interaction.options.getString("settlement", true);
    const reason = interaction.options.getString("reason", false);
    const settlement = findSettlementByIdOrName(guildState, input);
    if (!settlement) {
      await interaction.reply({ content: "Settlement not found.", flags: MessageFlags.Ephemeral });
      return;
    }

    const member = interaction.member;
    if (!canManageSettlement(member, settlement, admin)) {
      await interaction.reply({ content: "Only the settlement mayor (or an admin) can declare this.", flags: MessageFlags.Ephemeral });
      return;
    }

    // Remove mayor role from existing mayor (if any)
    if (settlement.mayorRoleId && settlement.mayorUserId) {
      const prev = await guild.members.fetch(settlement.mayorUserId).catch(() => null);
      if (prev) {
        await prev.roles.remove(settlement.mayorRoleId).catch(() => null);

        const mayorAggregateRoleId = await getOrCreateMayorAggregateRoleId(store, guild);
        const settlementMayorRoleIds = allSettlementMayorRoleIds(store, guild.id);
        if (mayorAggregateRoleId) {
          await syncMayorAggregateForMember({ member: prev, mayorAggregateRoleId, settlementMayorRoleIds });
        }
      }
    }

    const now = Date.now();
    await store.update(async (state) => {
      const s = state.guilds[guild.id]?.settlements?.[settlement.id];
      if (!s) return;
      s.tier = 0;
      s.mayorUserId = null;
      s.mayorGuildName = null;
      s.mayorSinceMs = null;
      s.mayorUntilMs = null;
      s.buildings = "";
      s.buyOrders = "";
      if (typeof reason === "string" && reason.trim()) s.notes = `Destroyed: ${reason.trim()}`;
      s.updatedAtMs = now;
    });

    const updated = findSettlementByIdOrName(mustGetGuildState(store, guild.id), settlement.id);
    if (updated) await upsertStatusCard(interaction, updated);
    await upsertGuildOverview(guild, store);

    const announcementsChannelId = store.get().guilds[guild.id]?.config?.announcementsChannelId;
    if (announcementsChannelId) {
      const chan = await guild.channels.fetch(announcementsChannelId).catch(() => null);
      if (chan && chan.type === ChannelType.GuildText) {
        await (chan as TextChannel).send(
          `Settlement **${settlement.name}** was declared **destroyed** (tier reset to 0).${reason?.trim() ? `\nReason: ${reason.trim()}` : ""}`,
        );
      }
    }

    await interaction.reply({
      content: `Marked **${settlement.name}** as destroyed (tier reset to 0).`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
};
