import { Guild, GuildMember, PermissionFlagsBits } from "discord.js";
import { StateStore } from "../state/store";

const MAYOR_ROLE_NAME = "Mayor";

export async function ensureMayorAggregateRole(guild: Guild): Promise<string> {
  const existing = guild.roles.cache.find((r) => r.name.toLowerCase() === MAYOR_ROLE_NAME.toLowerCase()) ?? null;
  if (existing) {
    if (!existing.hoist) {
      await existing.setHoist(true, "VerraVoice: show mayors separately").catch(() => null);
    }
    return existing.id;
  }

  const created = await guild.roles.create({
    name: MAYOR_ROLE_NAME,
    hoist: true,
    mentionable: false,
    permissions: [PermissionFlagsBits.ViewChannel],
    reason: "VerraVoice: create aggregate Mayor role",
  });
  return created.id;
}

export async function getOrCreateMayorAggregateRoleId(store: StateStore, guild: Guild): Promise<string | null> {
  const gs = store.get().guilds[guild.id];
  if (!gs) return null;
  if (gs.config.mayorAggregateRoleId) return gs.config.mayorAggregateRoleId;

  const id = await ensureMayorAggregateRole(guild);
  await store.update(async (state) => {
    const g = state.guilds[guild.id];
    if (!g) return;
    g.config.mayorAggregateRoleId = id;
  });
  return id;
}

export function allSettlementMayorRoleIds(store: StateStore, guildId: string): string[] {
  const gs = store.get().guilds[guildId];
  if (!gs) return [];
  return Array.from(
    new Set(
      Object.values(gs.settlements ?? {})
        .map((s) => s.mayorRoleId)
        .filter(Boolean) as string[],
    ),
  );
}

export async function syncMayorAggregateForMember(opts: {
  member: GuildMember;
  mayorAggregateRoleId: string;
  settlementMayorRoleIds: string[];
}) {
  const { member, mayorAggregateRoleId, settlementMayorRoleIds } = opts;
  if (!member) return;

  const shouldHave = settlementMayorRoleIds.some((rid) => member.roles.cache.has(rid));
  const has = member.roles.cache.has(mayorAggregateRoleId);
  if (shouldHave && !has) {
    await member.roles.add(mayorAggregateRoleId).catch(() => null);
  } else if (!shouldHave && has) {
    await member.roles.remove(mayorAggregateRoleId).catch(() => null);
  }
}
