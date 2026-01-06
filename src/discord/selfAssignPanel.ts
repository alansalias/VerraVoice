import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Guild,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextChannel,
} from "discord.js";
import { Settlement } from "../state/schema";
import { StateStore } from "../state/store";
import { buildSelfAssignEmbed } from "./embeds/selfAssign";

function buildCitizenZoneSelect(zones: { key: string; name: string }[]) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId("selfassign:citizen_zone")
    .setPlaceholder("Set citizenship (pick a zone first)")
    .setMinValues(1)
    .setMaxValues(1);

  menu.addOptions(new StringSelectMenuOptionBuilder().setLabel("None (clear citizenship)").setValue("none"));

  for (const z of zones.slice(0, 24)) {
    menu.addOptions(new StringSelectMenuOptionBuilder().setLabel(z.name).setValue(z.key));
  }
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
}

function buildSettlementViewZonePicker(zones: { key: string; name: string }[]) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId("selfassign:view_zone")
    .setPlaceholder("Optional: configure read-only settlement views (by zone)")
    .setMinValues(1)
    .setMaxValues(1);

  for (const z of zones.slice(0, 25)) {
    menu.addOptions(new StringSelectMenuOptionBuilder().setLabel(z.name).setValue(z.key));
  }
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
}

function buildZoneViewSelect(zones: { key: string; name: string }[]) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId("selfassign:zoneview")
    .setPlaceholder("Optional: view other zones (read-only)")
    .setMinValues(0)
    .setMaxValues(Math.min(25, zones.length));

  for (const z of zones.slice(0, 25)) {
    menu.addOptions(new StringSelectMenuOptionBuilder().setLabel(z.name).setValue(z.key));
  }
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
}

function buildGuildRoleButtons() {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("rolereq:open:guild_leader").setLabel("Request Guild Leader").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("rolereq:open:guild_officer").setLabel("Request Guild Officer").setStyle(ButtonStyle.Secondary),
  );
}

export async function upsertSelfAssignPanel(guild: Guild, store: StateStore) {
  const gs = store.get().guilds[guild.id];
  const channelId = gs?.config?.selfAssignChannelId ?? null;
  if (!channelId) return;

  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildText) return;
  const text = channel as TextChannel;

  const settlements = Object.values(gs.settlements ?? {}) as Settlement[];
  settlements.sort((a, b) => a.name.localeCompare(b.name));

  const zones = Array.from(new Set(settlements.map((s) => s.zone).filter((z) => !!z && z.trim().length))).sort((a, b) =>
    a.localeCompare(b),
  );
  const zoneOptions = zones.map((name) => ({ name, key: name.toLowerCase() }));

  const embed = buildSelfAssignEmbed();
  const components = [
    ...(zoneOptions.length ? [buildCitizenZoneSelect(zoneOptions)] : []),
    ...(zoneOptions.length ? [buildZoneViewSelect(zoneOptions)] : []),
    ...(zoneOptions.length ? [buildSettlementViewZonePicker(zoneOptions)] : []),
    buildGuildRoleButtons(),
  ];

  const messageId = gs?.config?.selfAssignMessageId ?? null;
  if (messageId) {
    const msg = await text.messages.fetch(messageId).catch(() => null);
    if (msg) {
      await msg.edit({ embeds: [embed], components }).catch(() => null);
      return;
    }
  }

  const msg = await text.send({ embeds: [embed], components }).catch(() => null);
  if (!msg) return;
  await store.update(async (state) => {
    const g = state.guilds[guild.id];
    if (!g) return;
    g.config.selfAssignMessageId = msg.id;
  });
}
