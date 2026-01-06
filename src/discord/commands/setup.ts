import { ChannelType, PermissionFlagsBits, TextChannel } from "discord.js";
import { MessageFlags } from "discord-api-types/v10";
import { DateTime } from "luxon";
import path from "node:path";
import { CommandHandler } from "./types";
import { isAdmin, requireGuild } from "../permissions";
import { loadSettlementCatalog } from "../../catalog/settlementCatalog";
import { populateFromCatalog } from "../populateCatalog";
import { buildMayorInfoEmbed } from "../embeds/mayorInfo";
import { buildRulesEmbed } from "../embeds/rules";
import { buildMayorHowToEmbed } from "../embeds/mayorHowTo";
import { moderatorRoleIds } from "../moderationRoles";
import { upsertSelfAssignPanel } from "../selfAssignPanel";
import { upsertGuildOverview } from "../overview";
import { ensureMayorAggregateRole } from "../mayorAggregate";
import { mayorClaimComponents } from "../interactions/mayorClaim";
import { mayorDashboardComponents } from "../interactions/mayorDashboard";

function discordApiErrorCode(err: unknown): number | null {
  if (!err || typeof err !== "object") return null;
  if (!("code" in err)) return null;
  const code = (err as { code?: unknown }).code;
  if (typeof code === "number") return code;
  if (typeof code === "string") {
    const asNumber = Number(code);
    if (Number.isFinite(asNumber)) return asNumber;
  }
  return null;
}

async function ensureBotCanPostInTextChannel(opts: {
  guild: import("discord.js").Guild;
  channelId: string;
  botId: string;
}) {
  const channel = await opts.guild.channels.fetch(opts.channelId).catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildText) return;
  const text = channel as TextChannel;

  // Ensure the bot can always post/edit embeds in bot-managed read-only channels.
  await text.permissionOverwrites
    .edit(opts.botId, {
      ViewChannel: true,
      SendMessages: true,
      EmbedLinks: true,
      ReadMessageHistory: true,
      MentionEveryone: true,
    })
    .catch(() => null);
}

async function ensureCategory(opts: {
  guild: import("discord.js").Guild;
  desiredName: string;
  existingId: string | null | undefined;
}) {
  const { guild, desiredName, existingId } = opts;
  const byId = existingId ? await guild.channels.fetch(existingId).catch(() => null) : null;
  if (byId && byId.type === ChannelType.GuildCategory) {
    await byId.edit({ name: desiredName }).catch(() => null);
    return byId.id;
  }
  const byName =
    guild.channels.cache.find(
      (c) => c.type === ChannelType.GuildCategory && c.name.toLowerCase() === desiredName.toLowerCase(),
    ) ?? null;
  if (byName) return byName.id;
  const created = await guild.channels.create({ name: desiredName, type: ChannelType.GuildCategory });
  return created.id;
}

async function ensureRole(opts: {
  guild: import("discord.js").Guild;
  desiredName: string;
  permissions?: import("discord.js").PermissionResolvable;
  hoist?: boolean;
}) {
  const { guild, desiredName, permissions, hoist } = opts;
  const existing = guild.roles.cache.find((r) => r.name.toLowerCase() === desiredName.toLowerCase()) ?? null;
  if (existing) {
    if (existing.mentionable) {
      await existing.setMentionable(false, "VerraVoice: lock down role pings").catch(() => null);
    }
    if (typeof hoist === "boolean" && existing.hoist !== hoist) {
      await existing.setHoist(hoist, "VerraVoice: ensure role hoist").catch(() => null);
    }
    if (permissions) {
      await existing.setPermissions(permissions, "VerraVoice: ensure role permissions").catch(() => null);
    }
    return existing.id;
  }
  const created = await guild.roles.create({ name: desiredName, mentionable: false, permissions, hoist });
  return created.id;
}

async function ensureTextChannel(opts: {
  guild: import("discord.js").Guild;
  desiredName: string;
  existingId: string | null | undefined;
  parentId: string | null | undefined;
  topic?: string;
  rateLimitPerUser?: number;
  permissionOverwrites?: import("discord.js").OverwriteResolvable[];
}) {
  const { guild, desiredName, existingId, parentId, topic, permissionOverwrites, rateLimitPerUser } = opts;
  const byId = existingId ? await guild.channels.fetch(existingId).catch(() => null) : null;
  const byName =
    guild.channels.cache.find(
      (c) =>
        c.type === ChannelType.GuildText &&
        c.name.toLowerCase() === desiredName.toLowerCase() &&
        (!parentId || c.parentId === parentId),
    ) ?? null;
  const resolved = (byId && byId.type === ChannelType.GuildText ? byId : null) ?? (byName && byName.type === ChannelType.GuildText ? byName : null);

  if (resolved && resolved.type === ChannelType.GuildText) {
    await resolved
      .edit({
        name: desiredName,
        parent: parentId ?? undefined,
        topic: topic ?? resolved.topic ?? undefined,
        rateLimitPerUser: rateLimitPerUser ?? resolved.rateLimitPerUser,
      })
      .catch(() => null);
    if (permissionOverwrites) {
      await resolved.permissionOverwrites.set(permissionOverwrites).catch(() => null);
    }
    return resolved.id;
  }

  const created = await guild.channels.create({
    name: desiredName,
    type: ChannelType.GuildText,
    parent: parentId ?? undefined,
    topic,
    rateLimitPerUser,
    permissionOverwrites,
  });
  return created.id;
}

async function ensureForumChannel(opts: {
  guild: import("discord.js").Guild;
  desiredName: string;
  existingId?: string | null;
  parentId: string | null | undefined;
  topic?: string;
}) {
  const { guild, desiredName, existingId, parentId, topic } = opts;
  const byId = existingId ? await guild.channels.fetch(existingId).catch(() => null) : null;
  const byNameInParent =
    guild.channels.cache.find(
      (c) =>
        c.type === ChannelType.GuildForum &&
        c.name.toLowerCase() === desiredName.toLowerCase() &&
        (!parentId || c.parentId === parentId),
    ) ?? null;
  const channel =
    (byId && byId.type === ChannelType.GuildForum ? byId : null) ??
    (byNameInParent && byNameInParent.type === ChannelType.GuildForum ? byNameInParent : null);
  if (channel && channel.type === ChannelType.GuildForum) {
    await channel
      .edit({
        name: desiredName,
        parent: parentId ?? undefined,
        topic: topic ?? channel.topic ?? undefined,
      })
      .catch(() => null);
    return channel.id;
  }
  const created = await guild.channels.create({
    name: desiredName,
    type: ChannelType.GuildForum,
    parent: parentId ?? undefined,
    topic,
  });
  return created.id;
}

async function upsertMayorInfo(opts: { guild: import("discord.js").Guild; store: import("../../state/store").StateStore }) {
  const { guild, store } = opts;
  const gs = store.get().guilds[guild.id];
  const channelId = gs?.config?.mayorInfoChannelId;
  if (!channelId) return;

  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildText) return;
  const text = channel as TextChannel;

  const embed = buildMayorInfoEmbed();
  const messageId = gs?.config?.mayorInfoMessageId ?? null;
  if (messageId) {
    const msg = await text.messages.fetch(messageId).catch(() => null);
    if (msg) {
      await msg.edit({ embeds: [embed], components: mayorClaimComponents() }).catch(() => null);
      return;
    }
  }

  const msg = await text.send({ embeds: [embed], components: mayorClaimComponents() }).catch(() => null);
  if (!msg) return;
  await store.update(async (state) => {
    const g = state.guilds[guild.id];
    if (!g) return;
    g.config.mayorInfoMessageId = msg.id;
  });
}

async function upsertRules(opts: { guild: import("discord.js").Guild; store: import("../../state/store").StateStore }) {
  const { guild, store } = opts;
  const gs = store.get().guilds[guild.id];
  const channelId = gs?.config?.rulesChannelId ?? null;
  if (!channelId) return;

  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildText) return;
  const text = channel as TextChannel;

  const embed = buildRulesEmbed();
  const messageId = gs?.config?.rulesMessageId ?? null;
  if (messageId) {
    const msg = await text.messages.fetch(messageId).catch(() => null);
    if (msg) {
      await msg.edit({ embeds: [embed] }).catch(() => null);
      return;
    }
  }

  const msg = await text.send({ embeds: [embed] }).catch(() => null);
  if (!msg) return;
  await store.update(async (state) => {
    const g = state.guilds[guild.id];
    if (!g) return;
    g.config.rulesMessageId = msg.id;
  });
}

async function upsertMayorHowTo(opts: { guild: import("discord.js").Guild; store: import("../../state/store").StateStore }) {
  const { guild, store } = opts;
  const gs = store.get().guilds[guild.id];
  const channelId = gs?.config?.mayorHowToChannelId ?? null;
  if (!channelId) return;

  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildText) return;
  const text = channel as TextChannel;

  const embed = buildMayorHowToEmbed();
  const messageId = gs?.config?.mayorHowToMessageId ?? null;
  if (messageId) {
    const msg = await text.messages.fetch(messageId).catch(() => null);
    if (msg) {
      await msg.edit({ embeds: [embed], components: mayorDashboardComponents() }).catch(() => null);
      if (!msg.pinned) await msg.pin().catch(() => null);
      return;
    }
  }

  const msg = await text.send({ embeds: [embed], components: mayorDashboardComponents() }).catch(() => null);
  if (!msg) return;
  if (!msg.pinned) await msg.pin().catch(() => null);
  await store.update(async (state) => {
    const g = state.guilds[guild.id];
    if (!g) return;
    g.config.mayorHowToMessageId = msg.id;
  });
}

async function cleanInstallGuild(opts: {
  guild: import("discord.js").Guild;
  botId: string;
  keepChannelId: string | null;
}) {
  const { guild, botId, keepChannelId } = opts;

  const channels = await guild.channels.fetch().catch(() => null);
  if (channels) {
    const all = Array.from(channels.values()).filter((c): c is NonNullable<typeof c> => c !== null);
    const toDelete = all.filter((c) => c.id !== keepChannelId);

    // Delete children first, categories last
    toDelete.sort((a, b) => {
      const aIsCat = a.type === ChannelType.GuildCategory ? 1 : 0;
      const bIsCat = b.type === ChannelType.GuildCategory ? 1 : 0;
      return aIsCat - bIsCat;
    });

    for (const c of toDelete) {
      await c.delete("VerraVoice clean install").catch(() => null);
    }
  }

  const botMember = guild.members.me ?? (await guild.members.fetchMe().catch(() => null));
  const botHighest = botMember?.roles?.highest?.position ?? 0;

  const roles = await guild.roles.fetch().catch(() => null);
  if (roles) {
    const deletable = Array.from(roles.values())
      .filter((r) => r.id !== guild.roles.everyone.id)
      .filter((r) => !r.managed)
      .filter((r) => r.position < botHighest)
      .sort((a, b) => a.position - b.position);

    for (const r of deletable) {
      await r.delete("VerraVoice clean install").catch(() => null);
    }
  }
}

export const handleSetup: CommandHandler = async ({ interaction, store, config }) => {
  if (interaction.commandName !== "setup") return;
  requireGuild(interaction);

  const sub = interaction.options.getSubcommand();

  const shouldDefer = sub === "init" || sub === "populate";
  const canReply = shouldDefer
    ? await interaction
        .deferReply({ flags: MessageFlags.Ephemeral })
        .then(() => true)
        .catch((err) => {
          if (discordApiErrorCode(err) === 10062) return false;
          throw err;
        })
    : true;

  if (!isAdmin(interaction)) {
    const content = "You need Manage Server (or Administrator) to run this.";
    if (canReply && shouldDefer) {
      await interaction.editReply({ content }).catch(() => null);
      return;
    }
    await interaction.reply({ content, flags: MessageFlags.Ephemeral }).catch(() => null);
    return;
  }

  const guild = interaction.guild;
  const botMember = guild.members.me ?? (await guild.members.fetchMe());
  const botId = botMember.id;
  const defaultTimezone = (() => {
    const tz = config.DEFAULT_TIMEZONE?.trim();
    if (!tz) return "UTC";
    const dt = DateTime.now().setZone(tz);
    return dt.isValid ? tz : "UTC";
  })();

  if (sub === "timezone") {
    const tz = interaction.options.getString("timezone", true).trim();
    const dt = DateTime.now().setZone(tz);
    if (!dt.isValid) {
      await interaction.reply({
        content: "Invalid timezone. Use an IANA name like `Europe/Oslo` or `UTC`.",
        flags: MessageFlags.Ephemeral,
      }).catch(() => null);
      return;
    }
    await store.update(async (state) => {
      const guildState = (state.guilds[guild.id] ??= {
        config: {
          timezone: defaultTimezone,
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
      guildState.config.timezone = tz;
    });
    await interaction.reply({ content: `Timezone set to **${tz}**.`, flags: MessageFlags.Ephemeral }).catch(() => null);
    return;
  }

  if (sub !== "init" && sub !== "populate") return;

  const cleanInstall = sub === "init" ? (interaction.options.getBoolean("clean_install") ?? false) : false;
  if (cleanInstall) {
    await cleanInstallGuild({ guild, botId, keepChannelId: interaction.channelId });
    await store.update(async (state) => {
      state.guilds[guild.id] = {
        config: {
          timezone: defaultTimezone,
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
      };
    });
  } else {
    await store.update(async (state) => {
      state.guilds[guild.id] ??= {
        config: {
          timezone: defaultTimezone,
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
      };
    });
  }

  const existingConfig = store.get().guilds[guild.id]?.config;
  const settlementsCategoryId = await ensureCategory({ guild, desiredName: "VerraVoice", existingId: existingConfig?.settlementsCategoryId });
  const moderationCategoryId = await ensureCategory({
    guild,
    desiredName: "VerraVoice - Moderation",
    existingId: existingConfig?.moderationCategoryId,
  });
  const infoCategoryId = await ensureCategory({ guild, desiredName: "Info", existingId: existingConfig?.infoCategoryId });
  const generalCategoryId = await ensureCategory({
    guild,
    desiredName: "General",
    existingId: existingConfig?.generalCategoryId,
  });

  const adminRoleId = await ensureRole({
    guild,
    desiredName: "VerraVoice Admin",
    permissions: [PermissionFlagsBits.Administrator],
  });
  const moderatorRoleId = await ensureRole({
    guild,
    desiredName: "VerraVoice Moderator",
    permissions: [PermissionFlagsBits.ModerateMembers, PermissionFlagsBits.ManageMessages],
  });

  const mayorAggregateRoleId = await ensureMayorAggregateRole(guild);

  // Roles used by the self-assign / guild-recruitment flow
  const guildLeaderRoleId = await ensureRole({ guild, desiredName: "Guild Leader" });
  const guildOfficerRoleId = await ensureRole({ guild, desiredName: "Guild Officer" });

  const modRoleIds = Array.from(new Set([...moderatorRoleIds(guild), adminRoleId, moderatorRoleId]));

  const announcementsChannelId = await ensureTextChannel({
    guild,
    desiredName: "settlement-updates",
    existingId: existingConfig?.announcementsChannelId,
    parentId: settlementsCategoryId,
    topic: "Bot announcements about settlement changes.",
    permissionOverwrites: [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.SendMessages] },
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

  const mayorInfoChannelId = await ensureTextChannel({
    guild,
    desiredName: "mayor-requests",
    existingId: existingConfig?.mayorInfoChannelId,
    parentId: settlementsCategoryId,
    topic: "Info + instructions for mayor verification requests.",
    permissionOverwrites: [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.SendMessages] },
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

  const mayorHowToChannelId = await ensureTextChannel({
    guild,
    desiredName: "mayor-how-to",
    existingId: existingConfig?.mayorHowToChannelId,
    parentId: settlementsCategoryId,
    topic: "Mayor-only guide to VerraVoice tools (read-only).",
    permissionOverwrites: [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      {
        id: mayorAggregateRoleId,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
        deny: [PermissionFlagsBits.SendMessages],
      },
      {
        id: botId,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.EmbedLinks,
          PermissionFlagsBits.ReadMessageHistory,
        ],
      },
      ...modRoleIds.map((id) => ({
        id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
      })),
    ],
  });

  const overviewChannelId = await ensureTextChannel({
    guild,
    desiredName: "server-overview",
    existingId: existingConfig?.overviewChannelId,
    parentId: settlementsCategoryId,
    topic: "Read-only overview of all settlements (tier + mayor).",
    permissionOverwrites: [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.SendMessages] },
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

  const requestsChannelId = await ensureTextChannel({
    guild,
    desiredName: "requests",
    existingId: existingConfig?.requestsChannelId,
    parentId: moderationCategoryId,
    topic: "Moderator-only: mayor claims and role requests awaiting review.",
    permissionOverwrites: [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      {
        id: botId,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.EmbedLinks,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.MentionEveryone,
        ],
      },
      ...modRoleIds.map((id) => ({
        id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.EmbedLinks,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.MentionEveryone,
        ],
      })),
    ],
  });

  const adminChatChannelId = await ensureTextChannel({
    guild,
    desiredName: "admin-chat",
    existingId: existingConfig?.adminChatChannelId,
    parentId: moderationCategoryId,
    topic: "Admin-only staff chat.",
    permissionOverwrites: [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.MentionEveryone] },
      {
        id: adminRoleId,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
      },
      {
        id: botId,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.EmbedLinks,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.MentionEveryone,
        ],
      },
    ],
  });

  const moderatorChatChannelId = await ensureTextChannel({
    guild,
    desiredName: "moderator-chat",
    existingId: existingConfig?.moderatorChatChannelId,
    parentId: moderationCategoryId,
    topic: "Moderator staff chat.",
    permissionOverwrites: [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.MentionEveryone] },
      {
        id: moderatorRoleId,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
      },
      {
        id: adminRoleId,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
      },
      {
        id: botId,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.EmbedLinks,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.MentionEveryone,
        ],
      },
    ],
  });

  const serverAnnouncementsChannelId = await ensureTextChannel({
    guild,
    desiredName: "server-announcements",
    existingId: existingConfig?.serverAnnouncementsChannelId,
    parentId: infoCategoryId,
    topic: "Admin announcements.",
    permissionOverwrites: [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.SendMessages] },
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

  const rulesChannelId = await ensureTextChannel({
    guild,
    desiredName: "rules",
    existingId: existingConfig?.rulesChannelId,
    parentId: infoCategoryId,
    topic: "Server rules (read-only).",
    permissionOverwrites: [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.SendMessages] },
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

  const selfAssignChannelId = await ensureTextChannel({
    guild,
    desiredName: "self-assign",
    existingId: existingConfig?.selfAssignChannelId,
    parentId: infoCategoryId,
    topic: "Self-assign settlement citizenship + optional read-only views + guild role requests.",
    permissionOverwrites: [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.SendMessages] },
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

  await ensureForumChannel({ guild, desiredName: "wtb-only", parentId: generalCategoryId, topic: "WTB forum (buy requests)." });
  await ensureForumChannel({ guild, desiredName: "wts-only", parentId: generalCategoryId, topic: "WTS forum (sell offers)." });
  await ensureForumChannel({
    guild,
    desiredName: "crafter-for-hire",
    parentId: generalCategoryId,
    topic: "Crafter-for-hire forum (commissions).",
  });

  await ensureTextChannel({ guild, desiredName: "lfg-lfm", existingId: null, parentId: generalCategoryId, topic: "Looking for group / more." });
  await ensureTextChannel({ guild, desiredName: "lf-scrims", existingId: null, parentId: generalCategoryId, topic: "Looking for scrims." });
  const generalChatId = await ensureTextChannel({
    guild,
    desiredName: "general",
    existingId: null,
    parentId: generalCategoryId,
    topic: "Main server chat.",
  });

  await ensureTextChannel({
    guild,
    desiredName: "system-messages",
    existingId: null,
    parentId: generalCategoryId,
    topic: "System messages (read-only).",
    permissionOverwrites: [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.SendMessages] },
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

  await ensureTextChannel({
    guild,
    desiredName: "guild-recruitment",
    existingId: null,
    parentId: generalCategoryId,
    topic: "Guild recruitment (only guild leaders/officers can post). Slowmode is capped by Discord to 6 hours.",
    rateLimitPerUser: 6 * 60 * 60,
    permissionOverwrites: [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.SendMessages] },
      {
        id: guildLeaderRoleId,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
      },
      {
        id: guildOfficerRoleId,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
      },
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

  const allMayorsChannelId = await ensureTextChannel({
    guild,
    desiredName: "all-mayors",
    existingId: existingConfig?.allMayorsChannelId,
    parentId: settlementsCategoryId,
    topic: "Mayor-only discussion channel.",
    permissionOverwrites: [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.MentionEveryone] },
      {
        id: mayorAggregateRoleId,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
        deny: [PermissionFlagsBits.MentionEveryone],
      },
      {
        id: moderatorRoleId,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
        deny: [PermissionFlagsBits.MentionEveryone],
      },
      {
        id: adminRoleId,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
      },
      {
        id: botId,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.EmbedLinks,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.MentionEveryone,
        ],
      },
    ],
  });

  const guildLeadershipChannelId = await ensureTextChannel({
    guild,
    desiredName: "guild-leadership",
    existingId: existingConfig?.guildLeadershipChannelId,
    parentId: generalCategoryId,
    topic: "Guild Leaders/Officers coordination channel.",
    permissionOverwrites: [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.MentionEveryone] },
      {
        id: guildLeaderRoleId,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
        deny: [PermissionFlagsBits.MentionEveryone],
      },
      {
        id: guildOfficerRoleId,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
        deny: [PermissionFlagsBits.MentionEveryone],
      },
      {
        id: moderatorRoleId,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
        deny: [PermissionFlagsBits.MentionEveryone],
      },
      {
        id: adminRoleId,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
      },
      {
        id: botId,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.EmbedLinks,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.MentionEveryone,
        ],
      },
    ],
  });

  await store.update(async (state) => {
    const g = state.guilds[guild.id];
    if (!g) return;
    g.config.settlementsCategoryId = settlementsCategoryId;
    g.config.moderationCategoryId = moderationCategoryId;
    g.config.infoCategoryId = infoCategoryId;
    g.config.generalCategoryId = generalCategoryId;
    g.config.announcementsChannelId = announcementsChannelId;
    g.config.adminRoleId = adminRoleId;
    g.config.moderatorRoleId = moderatorRoleId;
    g.config.mayorAggregateRoleId = mayorAggregateRoleId;
    g.config.mayorInfoChannelId = mayorInfoChannelId;
    g.config.mayorHowToChannelId = mayorHowToChannelId;
    g.config.adminChatChannelId = adminChatChannelId;
    g.config.moderatorChatChannelId = moderatorChatChannelId;
    g.config.allMayorsChannelId = allMayorsChannelId;
    g.config.guildLeadershipChannelId = guildLeadershipChannelId;
    g.config.overviewChannelId = overviewChannelId;
    g.config.requestsChannelId = requestsChannelId;
    g.config.serverAnnouncementsChannelId = serverAnnouncementsChannelId;
    g.config.rulesChannelId = rulesChannelId;
    g.config.selfAssignChannelId = selfAssignChannelId;
  });

  const s = store.get().guilds[guild.id]?.config;
  for (const id of [
    s?.requestsChannelId,
    s?.adminChatChannelId,
    s?.moderatorChatChannelId,
    s?.allMayorsChannelId,
    s?.guildLeadershipChannelId,
    s?.overviewChannelId,
    s?.mayorInfoChannelId,
    s?.mayorHowToChannelId,
    s?.announcementsChannelId,
    s?.rulesChannelId,
    s?.selfAssignChannelId,
    s?.serverAnnouncementsChannelId,
  ]) {
    if (!id) continue;
    await ensureBotCanPostInTextChannel({ guild, channelId: id, botId });
  }

  await upsertMayorInfo({ guild, store });
  await upsertRules({ guild, store });
  await upsertMayorHowTo({ guild, store });

  const dataDir = path.resolve(config.DATA_DIR ?? "data");
  const catalog = await loadSettlementCatalog(dataDir);
  await populateFromCatalog({ guild, store, catalog });
  await upsertSelfAssignPanel(guild, store);
  await upsertGuildOverview(guild, store);

  const replyContent = s
    ? `Setup complete.\n- VerraVoice: <#${s.settlementsCategoryId}>\n- Mayor info: <#${s.mayorInfoChannelId}>\n- Overview: <#${s.overviewChannelId}>\n- Settlement updates: <#${s.announcementsChannelId}>\n- Mod requests: <#${s.requestsChannelId}>\n- Info: <#${s.infoCategoryId}>\n- Rules: <#${s.rulesChannelId}>\n- Self-assign: <#${s.selfAssignChannelId}>\n- General: <#${s.generalCategoryId}>\n- Timezone: **${s.timezone}**`
    : "Setup complete.";

  // Respond before deleting the channel the command was run from (otherwise Discord can return "Unknown Message").
  if (canReply) {
    await interaction
      .editReply(replyContent)
      .catch(async () => {
        await interaction.followUp({ content: replyContent, flags: MessageFlags.Ephemeral }).catch(() => null);
      });
  } else {
    const channel =
      interaction.channel ?? (await guild.channels.fetch(interaction.channelId).catch(() => null));
    if (channel?.isTextBased()) {
      await channel.send({ content: replyContent }).catch(() => null);
    }
  }

  // If the command was run from the old root-level #general, try deleting it now that we created replacements.
  if (cleanInstall && interaction.channelId && interaction.channelId !== generalChatId) {
    const maybeOldGeneral = await guild.channels.fetch(interaction.channelId).catch(() => null);
    if (
      maybeOldGeneral &&
      maybeOldGeneral.type === ChannelType.GuildText &&
      maybeOldGeneral.parentId === null &&
      maybeOldGeneral.name.toLowerCase() === "general"
    ) {
      await maybeOldGeneral.delete("VerraVoice clean install (second pass)").catch(() => null);
    }
  }
};
