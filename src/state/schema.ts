import { z } from "zod";

export const SettlementTierSchema = z.number().int().min(0).max(5);
export type SettlementTier = z.infer<typeof SettlementTierSchema>;

export const GuildConfigSchema = z.object({
  timezone: z.string().min(1).default("UTC"),
  settlementsCategoryId: z.string().min(1).nullable().default(null),
  moderationCategoryId: z.string().min(1).nullable().default(null),
  announcementsChannelId: z.string().min(1).nullable().default(null),
  adminRoleId: z.string().min(1).nullable().default(null),
  moderatorRoleId: z.string().min(1).nullable().default(null),
  mayorAggregateRoleId: z.string().min(1).nullable().default(null),
  mayorHowToChannelId: z.string().min(1).nullable().default(null),
  mayorHowToMessageId: z.string().min(1).nullable().default(null),
  adminChatChannelId: z.string().min(1).nullable().default(null),
  moderatorChatChannelId: z.string().min(1).nullable().default(null),
  allMayorsChannelId: z.string().min(1).nullable().default(null),
  guildLeadershipChannelId: z.string().min(1).nullable().default(null),
  infoCategoryId: z.string().min(1).nullable().default(null),
  generalCategoryId: z.string().min(1).nullable().default(null),
  serverAnnouncementsChannelId: z.string().min(1).nullable().default(null),
  rulesChannelId: z.string().min(1).nullable().default(null),
  rulesMessageId: z.string().min(1).nullable().default(null),
  selfAssignChannelId: z.string().min(1).nullable().default(null),
  selfAssignMessageId: z.string().min(1).nullable().default(null),
  mayorInfoChannelId: z.string().min(1).nullable().default(null),
  mayorInfoMessageId: z.string().min(1).nullable().default(null),
  requestsChannelId: z.string().min(1).nullable().default(null), // private mod channel
  overviewChannelId: z.string().min(1).nullable().default(null),
  overviewMessageId: z.string().min(1).nullable().default(null),
  zoneMayorChannelIds: z.record(z.string(), z.string()).default({}),
  zoneViewRoleIds: z.record(z.string(), z.string()).default({}),
});
export type GuildConfig = z.infer<typeof GuildConfigSchema>;

export const ElectionConfigSchema = z.object({
  registrationStartMs: z.number().int().nullable().default(null),
  votingStartMs: z.number().int().nullable().default(null),
  votingEndMs: z.number().int().nullable().default(null),
  scheduleItemIds: z.array(z.string()).default([]),
});
export type ElectionConfig = z.infer<typeof ElectionConfigSchema>;

export const SettlementSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  zone: z.string().default(""),
  tier: SettlementTierSchema.default(0),
  mayorUserId: z.string().min(1).nullable().default(null),
  mayorGuildName: z.string().min(1).nullable().default(null),
  mayorSinceMs: z.number().int().nullable().default(null),
  mayorUntilMs: z.number().int().nullable().default(null),
  mayorRoleId: z.string().min(1).nullable().default(null),
  citizenRoleId: z.string().min(1).nullable().default(null),
  viewRoleId: z.string().min(1).nullable().default(null),
  channelId: z.string().min(1).nullable().default(null),
  statusCardMessageId: z.string().min(1).nullable().default(null),
  buildings: z.string().default(""),
  buyOrders: z.string().default(""),
  notes: z.string().default(""),
  election: ElectionConfigSchema.default({
    registrationStartMs: null,
    votingStartMs: null,
    votingEndMs: null,
    scheduleItemIds: [],
  }),
  createdAtMs: z.number().int(),
  updatedAtMs: z.number().int(),
});
export type Settlement = z.infer<typeof SettlementSchema>;

export const MayorRequestSchema = z.object({
  id: z.string().min(1),
  settlementId: z.string().min(1),
  requesterUserId: z.string().min(1),
  guildName: z.string().default(""),
  note: z.string().default(""),
  proofUrl: z.string().default(""),
  proofFilename: z.string().min(1).nullable().default(null),
  proofContentType: z.string().min(1).nullable().default(null),
  proofSize: z.number().int().nullable().default(null),
  status: z.enum(["pending", "approved", "denied", "canceled"]).default("pending"),
  createdAtMs: z.number().int(),
  reviewedAtMs: z.number().int().nullable().default(null),
  reviewedByUserId: z.string().min(1).nullable().default(null),
});
export type MayorRequest = z.infer<typeof MayorRequestSchema>;

export const RoleRequestSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["guild_leader", "guild_officer"]),
  requesterUserId: z.string().min(1),
  guildName: z.string().default(""),
  note: z.string().default(""),
  status: z.enum(["pending", "approved", "denied", "canceled"]).default("pending"),
  createdAtMs: z.number().int(),
  reviewedAtMs: z.number().int().nullable().default(null),
  reviewedByUserId: z.string().min(1).nullable().default(null),
});
export type RoleRequest = z.infer<typeof RoleRequestSchema>;

export const ScheduleItemSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["generic", "election", "war"]).default("generic"),
  settlementId: z.string().min(1).nullable().default(null),
  warDefenderSettlementId: z.string().min(1).nullable().default(null),
  warKind: z.enum(["war", "siege"]).nullable().default(null),
  discordEventId: z.string().min(1).nullable().default(null),
  title: z.string().min(1),
  description: z.string().nullable().default(null),
  announceChannelId: z.string().min(1),
  mentionRoleId: z.string().min(1).nullable().default(null),
  startsAtMs: z.number().int(),
  reminderOffsetsMinutes: z.array(z.number().int().min(0)).default([1440, 60, 15, 0]),
  sentOffsetMinutes: z.array(z.number().int().min(0)).default([]),
  createdByUserId: z.string().min(1),
  createdAtMs: z.number().int(),
});
export type ScheduleItem = z.infer<typeof ScheduleItemSchema>;

export const GuildStateSchema = z.object({
  config: GuildConfigSchema.default({
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
  }),
  settlements: z.record(z.string(), SettlementSchema).default({}),
  mayorRequests: z.record(z.string(), MayorRequestSchema).default({}),
  roleRequests: z.record(z.string(), RoleRequestSchema).default({}),
  schedule: z.record(z.string(), ScheduleItemSchema).default({}),
});
export type GuildState = z.infer<typeof GuildStateSchema>;

export const RootStateSchema = z.object({
  version: z.literal(1),
  guilds: z.record(z.string(), GuildStateSchema).default({}),
});
export type RootState = z.infer<typeof RootStateSchema>;

export function defaultState(): RootState {
  return RootStateSchema.parse({ version: 1, guilds: {} });
}
