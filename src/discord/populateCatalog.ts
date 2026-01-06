import { ChannelType, Guild, PermissionFlagsBits, TextChannel } from "discord.js";
import { Settlement, SettlementTier } from "../state/schema";
import { StateStore } from "../state/store";
import { slugify } from "../utils/strings";
import { buildSettlementCard } from "./embeds/settlementCard";
import { upsertGuildOverview } from "./overview";
import { moderatorRoleIds } from "./moderationRoles";

function normalizeName(name: string) {
  return name.trim();
}

function botCanManageChannel(opts: { guild: Guild; channel: any }) {
  const me = opts.guild.members.me;
  if (!me) return true; // fallback; avoid false negatives during startup
  const perms = opts.channel.permissionsFor(me);
  if (!perms) return false;
  return perms.has(PermissionFlagsBits.ViewChannel) && perms.has(PermissionFlagsBits.ManageChannels);
}

async function ensureCategory(guild: Guild, name: string): Promise<string> {
  const existing = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildCategory && c.name.toLowerCase() === name.toLowerCase(),
  );
  if (existing) return existing.id;
  const created = await guild.channels.create({ name, type: ChannelType.GuildCategory });
  return created.id;
}

async function ensureRole(guild: Guild, roleName: string): Promise<string> {
  const existing = guild.roles.cache.find((r) => r.name.toLowerCase() === roleName.toLowerCase()) ?? null;
  if (existing) {
    if (existing.mentionable) {
      await existing.setMentionable(false, "VerraVoice: lock down role pings").catch(() => null);
    }
    return existing.id;
  }
  const created = await guild.roles.create({ name: roleName, mentionable: false });
  return created.id;
}

async function ensureSettlementChannel(opts: {
  guild: Guild;
  categoryId: string;
  settlement: Settlement;
  mayorRoleId: string;
  citizenRoleId: string;
  viewRoleId: string;
  zoneViewRoleId: string | null;
  botId: string;
  modRoleIds: string[];
}): Promise<string> {
  const desired = opts.settlement.id;
  const existingById = opts.settlement.channelId
    ? await opts.guild.channels.fetch(opts.settlement.channelId).catch(() => null)
    : null;
  const existingByName =
    opts.guild.channels.cache.find((c) => c.type === ChannelType.GuildText && c.name.toLowerCase() === desired.toLowerCase()) ?? null;
  const existing = existingById ?? existingByName;

  const overwrites = [
    {
      id: opts.guild.roles.everyone.id,
      deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.MentionEveryone],
    },
    {
      id: opts.citizenRoleId,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
      deny: [PermissionFlagsBits.MentionEveryone],
    },
    {
      id: opts.viewRoleId,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
      deny: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.MentionEveryone],
    },
    ...(opts.zoneViewRoleId
      ? [
          {
            id: opts.zoneViewRoleId,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
            deny: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.MentionEveryone],
          },
        ]
      : []),
    {
      id: opts.mayorRoleId,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
      deny: [PermissionFlagsBits.MentionEveryone],
    },
    ...opts.modRoleIds.map((id) => ({
      id,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
    })),
    {
      id: opts.botId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.MentionEveryone,
      ],
    },
  ];

  if (existing && existing.type === ChannelType.GuildText) {
    // If the bot can't access/manage this channel (stale/locked down), don't try to edit it.
    if (!botCanManageChannel({ guild: opts.guild, channel: existing })) {
      // Fall through to creating a fresh channel.
    } else {
      // Ensure in correct category and perms
      try {
        await existing.edit({
          name: desired,
          parent: opts.categoryId,
          topic: `Settlement: ${opts.settlement.name}`,
        });
        await existing.permissionOverwrites.set(overwrites).catch(() => null);
        return existing.id;
      } catch {
        // Fall through to creating a fresh channel.
      }
    }
  }

  // Create a fresh channel. If Discord rejects the name (rare), fall back to a suffixed name.
  const tryNames = [desired, `${desired}-vv`, `${desired}-vv2`];
  for (const name of tryNames) {
    const created = await opts.guild.channels
      .create({
        name,
        type: ChannelType.GuildText,
        parent: opts.categoryId,
        topic: `Settlement: ${opts.settlement.name}`,
        permissionOverwrites: overwrites,
      })
      .catch(() => null);
    if (created) return created.id;
  }

  throw new Error(`Failed to create settlement channel for ${opts.settlement.name}. Check bot permissions.`);
}

async function ensureZoneMayorsChannel(opts: {
  guild: Guild;
  store: StateStore;
  zoneName: string;
  categoryId: string;
  botId: string;
  mayorRoleIds: string[];
  citizenRoleIds: string[];
  zoneViewRoleId: string | null;
}) {
  const zoneKey = opts.zoneName.toLowerCase();
  const channelName = `mayors-${slugify(opts.zoneName) || slugify(zoneKey) || "zone"}`;

  const gs = opts.store.get().guilds[opts.guild.id];
  const existingId = gs?.config?.zoneMayorChannelIds?.[zoneKey] ?? null;
  const existing =
    (existingId ? await opts.guild.channels.fetch(existingId).catch(() => null) : null) ??
    opts.guild.channels.cache.find((c) => c.type === ChannelType.GuildText && c.name.toLowerCase() === channelName.toLowerCase()) ??
    null;

    const overwrites = [
      { id: opts.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.MentionEveryone] },
      {
        id: opts.botId,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.EmbedLinks,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.MentionEveryone,
        ],
      },
      ...Array.from(new Set(opts.citizenRoleIds)).map((id) => ({
        id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
        deny: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.MentionEveryone],
      })),
      ...(opts.zoneViewRoleId
        ? [
            {
              id: opts.zoneViewRoleId,
              allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
              deny: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.MentionEveryone],
            },
          ]
        : []),
      ...Array.from(new Set(opts.mayorRoleIds)).map((id) => ({
        id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
        deny: [PermissionFlagsBits.MentionEveryone],
      })),
    ];

  if (existing && existing.type === ChannelType.GuildText) {
    if (botCanManageChannel({ guild: opts.guild, channel: existing })) {
      await existing
        .edit({
          name: channelName,
          parent: opts.categoryId,
          topic: `Zone mayors channel for ${opts.zoneName} (citizens can read; mayors can post).`,
        })
        .catch(() => null);
      await existing.permissionOverwrites.set(overwrites).catch(() => null);
      await existing.setPosition(0).catch(() => null);
      await opts.store.update(async (state) => {
        const g = state.guilds[opts.guild.id];
        if (!g) return;
        g.config.zoneMayorChannelIds[zoneKey] = existing.id;
      });
      return;
    }
  }

  const created = await opts.guild.channels
    .create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: opts.categoryId,
      topic: `Zone mayors channel for ${opts.zoneName} (citizens can read; mayors can post).`,
      permissionOverwrites: overwrites,
    })
    .catch(() => null);
  if (created) {
    await created.setPosition(0).catch(() => null);
    await opts.store.update(async (state) => {
      const g = state.guilds[opts.guild.id];
      if (!g) return;
      g.config.zoneMayorChannelIds[zoneKey] = created.id;
    });
  }
}

async function upsertStatusCard(guild: Guild, settlement: Settlement, store: StateStore) {
  if (!settlement.channelId) return;
  const channel = await guild.channels.fetch(settlement.channelId).catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildText) return;
  const text = channel as TextChannel;
  const embed = buildSettlementCard(settlement);

  if (settlement.statusCardMessageId) {
    const msg = await text.messages.fetch(settlement.statusCardMessageId).catch(() => null);
    if (msg) {
      await msg.edit({ embeds: [embed] }).catch(() => null);
      if (!msg.pinned) await msg.pin().catch(() => null);
      return;
    }
  }
  const msg = await text.send({ embeds: [embed] }).catch(() => null);
  if (!msg) return;
  if (!msg.pinned) await msg.pin().catch(() => null);
  await store.update(async (state) => {
    const s = state.guilds[guild.id]?.settlements?.[settlement.id];
    if (!s) return;
    s.statusCardMessageId = msg.id;
  });
}

export async function populateFromCatalog(opts: {
  guild: Guild;
  store: StateStore;
  catalog: { zones: { zone: string; settlements: string[] }[] };
}) {
  const { guild, store, catalog } = opts;
  const botMember = guild.members.me ?? (await guild.members.fetchMe());
  const botId = botMember.id;
  const now = Date.now();

  // Ensure guild state exists
  await store.update(async (state) => {
    state.guilds[guild.id] ??= {
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
    };
  });

  for (const zone of catalog.zones) {
    const zoneName = normalizeName(zone.zone);
    if (!zoneName) continue;
    const zoneKey = zoneName.toLowerCase();
    const categoryId = await ensureCategory(guild, zoneName);
    const zoneMayorRoleIds: string[] = [];
    const zoneCitizenRoleIds: string[] = [];
    const modRoleIds = moderatorRoleIds(guild);

    const zoneViewRoleId = await ensureRole(guild, `View Zone - ${zoneName}`);
    await store.update(async (state) => {
      const g = state.guilds[guild.id];
      if (!g) return;
      g.config.zoneViewRoleIds[zoneKey] = zoneViewRoleId;
    });

    for (const rawName of zone.settlements) {
      const settlementName = normalizeName(rawName);
      if (!settlementName) continue;

      const settlementIdBase = slugify(settlementName) || settlementName.toLowerCase();
      let settlementId = settlementIdBase;
      const currentGuildState = store.get().guilds[guild.id];
      if (currentGuildState?.settlements?.[settlementId] && currentGuildState.settlements[settlementId].name !== settlementName) {
        let i = 2;
        while (currentGuildState.settlements[`${settlementIdBase}-${i}`]) i++;
        settlementId = `${settlementIdBase}-${i}`;
      }

      // Ensure settlement state exists
      await store.update(async (state) => {
        const gs = state.guilds[guild.id];
        if (!gs) return;
        const existing = gs.settlements[settlementId];
        if (existing) {
          existing.name = settlementName;
          existing.zone = zoneName;
          existing.updatedAtMs = now;
          return;
        }
        gs.settlements[settlementId] = {
          id: settlementId,
          name: settlementName,
          zone: zoneName,
          tier: 0 as SettlementTier,
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

      const gs = store.get().guilds[guild.id];
      const settlement = gs?.settlements?.[settlementId] as Settlement | undefined;
      if (!settlement) continue;

      const mayorRoleId = await ensureRole(guild, `Mayor of ${settlement.name}`);
      const citizenRoleId = await ensureRole(guild, `${settlement.name} Citizens`);
      const viewRoleId = await ensureRole(guild, `View ${settlement.name}`);
      zoneMayorRoleIds.push(mayorRoleId);
      zoneCitizenRoleIds.push(citizenRoleId);

      const channelId = await ensureSettlementChannel({
        guild,
        categoryId,
        settlement,
        mayorRoleId,
        citizenRoleId,
        viewRoleId,
        zoneViewRoleId,
        botId,
        modRoleIds,
      });

      await store.update(async (state) => {
        const s = state.guilds[guild.id]?.settlements?.[settlementId];
        if (!s) return;
        s.mayorRoleId = mayorRoleId;
        s.citizenRoleId = citizenRoleId;
        s.viewRoleId = viewRoleId;
        s.channelId = channelId;
        s.zone = zoneName;
        s.updatedAtMs = Date.now();
      });

      const updated = store.get().guilds[guild.id]?.settlements?.[settlementId] as Settlement | undefined;
      if (updated) await upsertStatusCard(guild, updated, store);
    }

    // Create/update zone mayors channel after we know the citizen/mayor roles.
    await ensureZoneMayorsChannel({
      guild,
      store,
      zoneName,
      categoryId,
      botId,
      mayorRoleIds: zoneMayorRoleIds,
      citizenRoleIds: zoneCitizenRoleIds,
      zoneViewRoleId,
    });
  }

  await upsertGuildOverview(guild, store);
}
