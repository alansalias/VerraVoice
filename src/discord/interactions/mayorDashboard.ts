import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChannelType,
  GuildScheduledEventEntityType,
  GuildScheduledEventPrivacyLevel,
  ModalBuilder,
  ModalSubmitInteraction,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
  StringSelectMenuOptionBuilder,
  TextChannel,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { DateTime } from "luxon";
import { MessageFlags } from "discord-api-types/v10";
import { Logger } from "../../logger";
import { Settlement, SettlementTierSchema } from "../../state/schema";
import { StateStore } from "../../state/store";
import { newId } from "../../utils/ids";
import { buildSettlementCard } from "../embeds/settlementCard";
import { tierName } from "../tiers";
import { upsertGuildOverview } from "../overview";
import { allSettlementMayorRoleIds, getOrCreateMayorAggregateRoleId, syncMayorAggregateForMember } from "../mayorAggregate";

function parseWhen(input: string, timezone: string) {
  const formats = ["yyyy-MM-dd HH:mm", "yyyy-MM-dd H:mm", "yyyy-MM-dd'T'HH:mm", "yyyy-MM-dd'T'HH:mm:ss"];
  for (const fmt of formats) {
    const dt = DateTime.fromFormat(input, fmt, { zone: timezone });
    if (dt.isValid) return dt;
  }
  const iso = DateTime.fromISO(input, { zone: timezone });
  if (iso.isValid) return iso;
  return null;
}

function parseYesNo(input: string | null | undefined, defaultValue: boolean) {
  const raw = (input ?? "").trim().toLowerCase();
  if (!raw) return defaultValue;
  if (["y", "yes", "true", "1"].includes(raw)) return true;
  if (["n", "no", "false", "0"].includes(raw)) return false;
  return defaultValue;
}

function findSettlement(guildState: any, input: string): Settlement | null {
  const byId = guildState?.settlements?.[input];
  if (byId) return byId;
  const lower = input.toLowerCase().trim();
  for (const settlement of Object.values(guildState?.settlements ?? {}) as Settlement[]) {
    if (settlement.name.toLowerCase() === lower) return settlement;
  }
  return null;
}

function isAdminLike(interaction: ButtonInteraction<"cached"> | StringSelectMenuInteraction<"cached"> | ModalSubmitInteraction<"cached">) {
  const perms = interaction.memberPermissions;
  if (!perms) return false;
  return perms.has(PermissionFlagsBits.Administrator) || perms.has(PermissionFlagsBits.ManageGuild);
}

function manageableSettlements(gs: any, member: any, admin: boolean): Settlement[] {
  const settlements = Object.values(gs?.settlements ?? {}) as Settlement[];
  if (admin) return settlements;
  return settlements.filter((s) => s.mayorRoleId && member.roles.cache.has(s.mayorRoleId));
}

function settlementSelectRow(opts: { customId: string; settlements: Settlement[] }) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(opts.customId)
    .setPlaceholder("Select settlement")
    .setMinValues(1)
    .setMaxValues(1);

  for (const s of opts.settlements.slice(0, 25)) {
    menu.addOptions(new StringSelectMenuOptionBuilder().setLabel(s.name).setValue(s.id));
  }
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
}

function modalId(action: string, settlementId: string) {
  return `mayordashmodal:${action}:${settlementId}`;
}

export function mayorDashboardComponents() {
  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("mayordash:status").setLabel("Update Status").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("mayordash:tier").setLabel("Set Tier").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("mayordash:announce").setLabel("Announce").setStyle(ButtonStyle.Success),
  );
  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("mayordash:election").setLabel("Set Election").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("mayordash:war").setLabel("Declare War").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("mayordash:siege").setLabel("Declare Siege").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("mayordash:destroyed").setLabel("Declare Destroyed").setStyle(ButtonStyle.Secondary),
  );
  return [row1, row2];
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

async function ensureCanAnnounce(gs: any, guild: any) {
  const channelId = gs?.config?.announcementsChannelId ?? null;
  if (!channelId) return null;
  const chan = await guild.channels.fetch(channelId).catch(() => null);
  if (!chan || chan.type !== ChannelType.GuildText) return null;
  return chan as TextChannel;
}

export async function handleMayorDashboardButtons(opts: { interaction: ButtonInteraction; store: StateStore; logger: Logger }) {
  const { interaction, store } = opts;
  if (!interaction.inCachedGuild()) return;
  if (!interaction.customId.startsWith("mayordash:")) return;

  const action = interaction.customId.split(":")[1] ?? "";
  const gs = store.get().guilds[interaction.guildId];
  if (!gs) {
    await interaction.reply({
      content: "Server is not initialized. Ask an admin to run `/setup init`.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const admin = isAdminLike(interaction);
  const available = manageableSettlements(gs, interaction.member, admin).sort((a, b) => a.name.localeCompare(b.name));
  if (!available.length) {
    await interaction.reply({
      content: "You don't have any mayor settlements assigned in this server.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (available.length === 1) {
    const settlementId = available[0].id;
    await showModalForAction(interaction, action, settlementId, store);
    return;
  }

  await interaction.reply({
    content: "Select which settlement you want to manage:",
    components: [settlementSelectRow({ customId: `mayordashsel:${action}`, settlements: available })],
    flags: MessageFlags.Ephemeral,
  });
}

export async function handleMayorDashboardMenus(opts: { interaction: StringSelectMenuInteraction; store: StateStore; logger: Logger }) {
  const { interaction, store } = opts;
  if (!interaction.inCachedGuild()) return;
  if (!interaction.customId.startsWith("mayordashsel:")) return;

  const action = interaction.customId.split(":")[1] ?? "";
  const settlementId = interaction.values[0] ?? "";
  if (!settlementId) return;

  await showModalForAction(interaction, action, settlementId, store);
}

async function showModalForAction(
  interaction: ButtonInteraction<"cached"> | StringSelectMenuInteraction<"cached">,
  action: string,
  settlementId: string,
  store: StateStore,
) {
  const gs = store.get().guilds[interaction.guildId];
  const settlement = gs?.settlements?.[settlementId] as Settlement | undefined;
  if (!gs || !settlement) {
    await interaction.reply({ content: "Settlement not found.", flags: MessageFlags.Ephemeral }).catch(() => null);
    return;
  }

  const titleBase = settlement.name.length > 40 ? settlement.name.slice(0, 40) : settlement.name;
  const timezone = gs.config.timezone || "UTC";

  if (action === "status") {
    const modal = new ModalBuilder().setCustomId(modalId(action, settlementId)).setTitle(`Update Status - ${titleBase}`);
    const buildings = new TextInputBuilder()
      .setCustomId("buildings")
      .setLabel("Buildings (optional)")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(false)
      .setMaxLength(900);
    const buyOrders = new TextInputBuilder()
      .setCustomId("buy_orders")
      .setLabel("Buy orders (optional)")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(false)
      .setMaxLength(900);
    const notes = new TextInputBuilder()
      .setCustomId("notes")
      .setLabel("Notes (optional)")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(false)
      .setMaxLength(900);
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(buildings),
      new ActionRowBuilder<TextInputBuilder>().addComponents(buyOrders),
      new ActionRowBuilder<TextInputBuilder>().addComponents(notes),
    );
    await interaction.showModal(modal);
    return;
  }

  if (action === "tier") {
    const modal = new ModalBuilder().setCustomId(modalId(action, settlementId)).setTitle(`Set Tier - ${titleBase}`);
    const tier = new TextInputBuilder()
      .setCustomId("tier")
      .setLabel("Tier (0-5)")
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(1);
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(tier));
    await interaction.showModal(modal);
    return;
  }

  if (action === "announce") {
    const modal = new ModalBuilder().setCustomId(modalId(action, settlementId)).setTitle(`Announcement - ${titleBase}`);
    const message = new TextInputBuilder()
      .setCustomId("message")
      .setLabel("Announcement message")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setMaxLength(1500);
    const ping = new TextInputBuilder()
      .setCustomId("ping")
      .setLabel("Ping citizens? (yes/no, default yes)")
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setMaxLength(3);
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(message),
      new ActionRowBuilder<TextInputBuilder>().addComponents(ping),
    );
    await interaction.showModal(modal);
    return;
  }

  if (action === "election") {
    const modal = new ModalBuilder().setCustomId(modalId(action, settlementId)).setTitle(`Election Schedule - ${titleBase}`);
    const reg = new TextInputBuilder()
      .setCustomId("registration_start")
      .setLabel(`Registration start (YYYY-MM-DD HH:mm, 24h, ${timezone})`)
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(25);
    const voteStart = new TextInputBuilder()
      .setCustomId("voting_start")
      .setLabel(`Voting start (YYYY-MM-DD HH:mm, 24h, ${timezone})`)
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(25);
    const voteEnd = new TextInputBuilder()
      .setCustomId("voting_end")
      .setLabel(`Voting end (YYYY-MM-DD HH:mm, 24h, ${timezone})`)
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(25);
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(reg),
      new ActionRowBuilder<TextInputBuilder>().addComponents(voteStart),
      new ActionRowBuilder<TextInputBuilder>().addComponents(voteEnd),
    );
    await interaction.showModal(modal);
    return;
  }

  if (action === "war" || action === "siege") {
    const kindLabel = action === "siege" ? "Siege" : "War";
    const modal = new ModalBuilder().setCustomId(modalId(action, settlementId)).setTitle(`Declare ${kindLabel} - ${titleBase}`);
    const defender = new TextInputBuilder()
      .setCustomId("defender")
      .setLabel("Defender settlement name")
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(64);
    const startsAt = new TextInputBuilder()
      .setCustomId("starts_at")
      .setLabel(`${kindLabel} starts at (YYYY-MM-DD HH:mm, 24h, ${timezone})`)
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(25);
    const title = new TextInputBuilder()
      .setCustomId("title")
      .setLabel("Short title")
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(80);
    const description = new TextInputBuilder()
      .setCustomId("description")
      .setLabel("Optional description/details")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(false)
      .setMaxLength(900);
    const createEvent = new TextInputBuilder()
      .setCustomId("create_event")
      .setLabel("Create Discord event? (yes/no, default yes)")
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setMaxLength(3);
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(defender),
      new ActionRowBuilder<TextInputBuilder>().addComponents(startsAt),
      new ActionRowBuilder<TextInputBuilder>().addComponents(title),
      new ActionRowBuilder<TextInputBuilder>().addComponents(description),
      new ActionRowBuilder<TextInputBuilder>().addComponents(createEvent),
    );
    await interaction.showModal(modal);
    return;
  }

  if (action === "destroyed") {
    const modal = new ModalBuilder().setCustomId(modalId(action, settlementId)).setTitle(`Declare Destroyed - ${titleBase}`);
    const reason = new TextInputBuilder()
      .setCustomId("reason")
      .setLabel("Optional reason/details")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(false)
      .setMaxLength(900);
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(reason));
    await interaction.showModal(modal);
    return;
  }

  await interaction.reply({ content: "Unknown action.", flags: MessageFlags.Ephemeral }).catch(() => null);
}

export async function handleMayorDashboardModal(opts: { interaction: ModalSubmitInteraction; store: StateStore; logger: Logger }) {
  const { interaction, store } = opts;
  if (!interaction.inCachedGuild()) return;
  if (!interaction.customId.startsWith("mayordashmodal:")) return;

  const [, action, settlementId] = interaction.customId.split(":");
  if (!action || !settlementId) return;

  const gs = store.get().guilds[interaction.guildId];
  if (!gs) {
    await interaction.reply({
      content: "Server is not initialized. Ask an admin to run `/setup init`.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const settlement = gs.settlements?.[settlementId] as Settlement | undefined;
  if (!settlement) {
    await interaction.reply({ content: "Settlement not found.", flags: MessageFlags.Ephemeral });
    return;
  }

  const admin = isAdminLike(interaction);
  const canManage = admin || (settlement.mayorRoleId && interaction.member.roles.cache.has(settlement.mayorRoleId));
  if (!canManage) {
    await interaction.reply({
      content: "Only the settlement mayor (or an admin) can do this.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const guild = interaction.guild;
  const now = Date.now();

  if (action === "status") {
    const buildings = interaction.fields.getTextInputValue("buildings")?.trim() ?? "";
    const buyOrders = interaction.fields.getTextInputValue("buy_orders")?.trim() ?? "";
    const notes = interaction.fields.getTextInputValue("notes")?.trim() ?? "";
    if (!buildings && !buyOrders && !notes) {
      await interaction.reply({ content: "Provide at least one field to update.", flags: MessageFlags.Ephemeral });
      return;
    }

    await store.update(async (state) => {
      const s = state.guilds[guild.id]?.settlements?.[settlement.id];
      if (!s) return;
      if (buildings) s.buildings = buildings;
      if (buyOrders) s.buyOrders = buyOrders;
      if (notes) s.notes = notes;
      s.updatedAtMs = now;
    });

    const updated = store.get().guilds[guild.id]?.settlements?.[settlement.id] as Settlement | undefined;
    if (updated) await upsertSettlementStatusCard({ guild, settlement: updated, store });
    await upsertGuildOverview(guild, store);
    await interaction.reply({
      content: `Updated status card for **${settlement.name}**.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (action === "tier") {
    const tierRaw = interaction.fields.getTextInputValue("tier").trim();
    const parsed = SettlementTierSchema.safeParse(Number(tierRaw));
    if (!parsed.success) {
      await interaction.reply({ content: "Tier must be a number 0..5.", flags: MessageFlags.Ephemeral });
      return;
    }
    const tier = parsed.data;

    await store.update(async (state) => {
      const s = state.guilds[guild.id]?.settlements?.[settlement.id];
      if (!s) return;
      s.tier = tier;
      s.updatedAtMs = now;
    });
    const updated = store.get().guilds[guild.id]?.settlements?.[settlement.id] as Settlement | undefined;
    if (updated) await upsertSettlementStatusCard({ guild, settlement: updated, store });
    await upsertGuildOverview(guild, store);

    const announce = await ensureCanAnnounce(gs, guild);
    if (announce) {
      await announce
        .send({ content: `Settlement **${settlement.name}** is now tier **${tier}** (${tierName(tier)}).`, allowedMentions: { parse: [] } })
        .catch(() => null);
    }

    await interaction.reply({
      content: `Set **${settlement.name}** tier to **${tier}** (${tierName(tier)}).`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (action === "announce") {
    const message = interaction.fields.getTextInputValue("message").trim();
    const pingRaw = (interaction.fields.getTextInputValue("ping") ?? "").trim().toLowerCase();
    const pingCitizens = pingRaw ? ["y", "yes", "true", "1"].includes(pingRaw) : true;

    const targetChannelId = settlement.channelId ?? gs.config.announcementsChannelId ?? null;
    if (!targetChannelId) {
      await interaction.reply({
        content: "No announce channel configured. Ask an admin to run `/setup init`.",
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

    await interaction.reply({
      content: `Announcement sent for **${settlement.name}**.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (action === "election") {
    const timezone = gs.config.timezone || "UTC";
    const reg = parseWhen(interaction.fields.getTextInputValue("registration_start").trim(), timezone);
    const voteStart = parseWhen(interaction.fields.getTextInputValue("voting_start").trim(), timezone);
    const voteEnd = parseWhen(interaction.fields.getTextInputValue("voting_end").trim(), timezone);
    if (!reg || !voteStart || !voteEnd) {
      await interaction.reply({
        content: `Couldn't parse time(s). Use \`YYYY-MM-DD HH:mm\` in ${timezone}.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    if (!(reg < voteStart && voteStart < voteEnd)) {
      await interaction.reply({
        content: "Times must be increasing: registration_start < voting_start < voting_end.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    if (voteEnd.toMillis() <= now) {
      await interaction.reply({ content: "Voting end must be in the future.", flags: MessageFlags.Ephemeral });
      return;
    }

    const announceChannelId = gs.config.announcementsChannelId ?? null;
    if (!announceChannelId) {
      await interaction.reply({
        content: "No announcements channel configured. Ask an admin to run `/setup init`.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const oldIds = settlement.election.scheduleItemIds ?? [];
    await store.update(async (state) => {
      const g = state.guilds[guild.id];
      if (!g) return;
      for (const id of oldIds) delete g.schedule[id];
    });

    const idReg = newId("election_reg");
    const idVoteOpen = newId("election_voteopen");
    const idVoteEndsSoon = newId("election_voteends");
    const idVoteClose = newId("election_voteclose");
    const voteEndsSoonAt = voteEnd.minus({ hours: 24 });
    const includeVoteEndsSoon = voteEndsSoonAt.toMillis() > now;

    await store.update(async (state) => {
      const g = state.guilds[guild.id];
      if (!g) return;
      g.schedule[idReg] = {
        id: idReg,
        type: "election",
        settlementId: settlement.id,
        warDefenderSettlementId: null,
        warKind: null,
        discordEventId: null,
        title: `${settlement.name}: Election registration opens`,
        description: null,
        announceChannelId,
        mentionRoleId: null,
        startsAtMs: reg.toMillis(),
        reminderOffsetsMinutes: [0],
        sentOffsetMinutes: [],
        createdByUserId: interaction.user.id,
        createdAtMs: now,
      };
      g.schedule[idVoteOpen] = {
        id: idVoteOpen,
        type: "election",
        settlementId: settlement.id,
        warDefenderSettlementId: null,
        warKind: null,
        discordEventId: null,
        title: `${settlement.name}: Election voting is open`,
        description: null,
        announceChannelId,
        mentionRoleId: null,
        startsAtMs: voteStart.toMillis(),
        reminderOffsetsMinutes: [0],
        sentOffsetMinutes: [],
        createdByUserId: interaction.user.id,
        createdAtMs: now,
      };
      if (includeVoteEndsSoon) {
        g.schedule[idVoteEndsSoon] = {
          id: idVoteEndsSoon,
          type: "election",
          settlementId: settlement.id,
          warDefenderSettlementId: null,
          warKind: null,
          discordEventId: null,
          title: `${settlement.name}: Voting ends in 24h`,
          description: null,
          announceChannelId,
          mentionRoleId: null,
          startsAtMs: voteEndsSoonAt.toMillis(),
          reminderOffsetsMinutes: [0],
          sentOffsetMinutes: [],
          createdByUserId: interaction.user.id,
          createdAtMs: now,
        };
      }
      g.schedule[idVoteClose] = {
        id: idVoteClose,
        type: "election",
        settlementId: settlement.id,
        warDefenderSettlementId: null,
        warKind: null,
        discordEventId: null,
        title: `${settlement.name}: Voting has ended`,
        description: null,
        announceChannelId,
        mentionRoleId: null,
        startsAtMs: voteEnd.toMillis(),
        reminderOffsetsMinutes: [0],
        sentOffsetMinutes: [],
        createdByUserId: interaction.user.id,
        createdAtMs: now,
      };

      const s = g.settlements[settlement.id];
      if (!s) return;
      s.election.registrationStartMs = reg.toMillis();
      s.election.votingStartMs = voteStart.toMillis();
      s.election.votingEndMs = voteEnd.toMillis();
      s.election.scheduleItemIds = includeVoteEndsSoon ? [idReg, idVoteOpen, idVoteEndsSoon, idVoteClose] : [idReg, idVoteOpen, idVoteClose];
      s.updatedAtMs = now;
    });

    const chan = await guild.channels.fetch(announceChannelId).catch(() => null);
    if (chan && chan.type === ChannelType.GuildText) {
      await (chan as TextChannel).send(
        `Election schedule updated for **${settlement.name}**.\nRegistration: <t:${Math.floor(reg.toSeconds())}:F>\nVoting: <t:${Math.floor(
          voteStart.toSeconds(),
        )}:F> -> <t:${Math.floor(voteEnd.toSeconds())}:F>`,
      );
    }

    await interaction.reply({
      content: `Election schedule set for **${settlement.name}**.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (action === "war" || action === "siege") {
    const kind = action === "siege" ? "siege" : "war";
    const defenderInput = interaction.fields.getTextInputValue("defender").trim();
    const title = interaction.fields.getTextInputValue("title").trim();
    const description = (interaction.fields.getTextInputValue("description") ?? "").trim();
    const startsAtInput = interaction.fields.getTextInputValue("starts_at").trim();
    const createEventRaw = interaction.fields.getTextInputValue("create_event");
    const createEvent = parseYesNo(createEventRaw, true);

    const defender = findSettlement(gs, defenderInput);
    if (!defender) {
      await interaction.reply({
        content: "Defender settlement not found. Use the exact name from the settlement list.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    if (defender.id === settlement.id) {
      await interaction.reply({ content: "Attacker and defender must be different settlements.", flags: MessageFlags.Ephemeral });
      return;
    }

    const timezone = gs.config.timezone || "UTC";
    const dt = parseWhen(startsAtInput, timezone);
    if (!dt) {
      await interaction.reply({
        content: `Couldn't parse time. Use \`YYYY-MM-DD HH:mm\` in ${timezone}.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    if (dt.toMillis() <= now) {
      await interaction.reply({ content: "Start time must be in the future.", flags: MessageFlags.Ephemeral });
      return;
    }

    const announceChannelId = gs.config.announcementsChannelId ?? null;
    if (!announceChannelId) {
      await interaction.reply({
        content: "No announcements channel configured. Ask an admin to run `/setup init`.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const id = newId("war");
    let discordEventId: string | null = null;
    if (createEvent) {
      const name = `${kind === "siege" ? "Siege" : "War"}: ${settlement.name} vs ${defender.name}`;
      const start = dt.toJSDate();
      const end = dt.plus({ hours: 2 }).toJSDate();
      const eventDescription = [
        `${kind === "siege" ? "Siege" : "War"} declared by ${settlement.name} vs ${defender.name}.`,
        title ? `Title: ${title}` : null,
        description ? `\n${description}` : null,
      ]
        .filter(Boolean)
        .join("\n");

      const ev = await guild.scheduledEvents
        .create({
          name,
          scheduledStartTime: start,
          scheduledEndTime: end,
          privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
          entityType: GuildScheduledEventEntityType.External,
          entityMetadata: { location: "In-game (Ashes of Creation)" },
          description: eventDescription.slice(0, 1000),
        })
        .catch(() => null);
      discordEventId = ev?.id ?? null;
    }

    await store.update(async (state) => {
      const g = state.guilds[guild.id];
      if (!g) return;
      g.schedule[id] = {
        id,
        type: "war",
        settlementId: settlement.id,
        warDefenderSettlementId: defender.id,
        warKind: kind === "siege" ? "siege" : "war",
        discordEventId,
        title: `${kind === "siege" ? "Siege" : "War"}: ${settlement.name} vs ${defender.name} - ${title}`,
        description: description || null,
        announceChannelId,
        mentionRoleId: null,
        startsAtMs: dt.toMillis(),
        reminderOffsetsMinutes: [1440, 60, 15, 0],
        sentOffsetMinutes: [],
        createdByUserId: interaction.user.id,
        createdAtMs: now,
      };
    });

    const chan = await guild.channels.fetch(announceChannelId).catch(() => null);
    if (chan && chan.type === ChannelType.GuildText) {
      const desc = description ? `\n${description}` : "";
      const kindLabel = kind === "siege" ? "Siege" : "War";
      const eventUrl = discordEventId ? `\nEvent: https://discord.com/events/${guild.id}/${discordEventId}` : "";
      await (chan as TextChannel)
        .send({
          content: `**${kindLabel} declared**: **${settlement.name}** (attacker) vs **${defender.name}** (defender) — ${title}\nStarts at <t:${Math.floor(
            dt.toSeconds(),
          )}:F>.${desc}${eventUrl}`,
          allowedMentions: { parse: [] },
        })
        .catch(() => null);
    }

    await interaction.reply({
      content: `${kind === "siege" ? "Siege" : "War"} scheduled (**${id}**) for **${settlement.name}** vs **${defender.name}**.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (action === "destroyed") {
    const reason = (interaction.fields.getTextInputValue("reason") ?? "").trim();

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

    await store.update(async (state) => {
      const s = state.guilds[guild.id]?.settlements?.[settlement.id];
      if (!s) return;
      s.tier = 0;
      s.mayorUserId = null;
      s.mayorSinceMs = null;
      s.mayorUntilMs = null;
      s.buildings = "";
      s.buyOrders = "";
      if (reason) s.notes = `Destroyed: ${reason}`;
      s.updatedAtMs = now;
    });

    const updated = store.get().guilds[guild.id]?.settlements?.[settlement.id] as Settlement | undefined;
    if (updated) await upsertSettlementStatusCard({ guild, settlement: updated, store });
    await upsertGuildOverview(guild, store);

    const announce = await ensureCanAnnounce(gs, guild);
    if (announce) {
      await announce
        .send({
          content: `Settlement **${settlement.name}** was declared **destroyed** (tier reset to 0).${reason ? `\nReason: ${reason}` : ""}`,
          allowedMentions: { parse: [] },
        })
        .catch(() => null);
    }

    await interaction.reply({
      content: `Marked **${settlement.name}** as destroyed (tier reset to 0).`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.reply({ content: "Unknown action.", flags: MessageFlags.Ephemeral });
}
