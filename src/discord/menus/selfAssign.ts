import { ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuInteraction, StringSelectMenuOptionBuilder } from "discord.js";
import { MessageFlags } from "discord-api-types/v10";
import { Settlement } from "../../state/schema";
import { StateStore } from "../../state/store";

function settlements(store: StateStore, guildId: string) {
  const gs = store.get().guilds[guildId];
  return Object.values(gs?.settlements ?? {}) as Settlement[];
}

function zonesFromSettlements(allSettlements: Settlement[]) {
  const byKey = new Map<string, { key: string; name: string; settlementIds: string[] }>();
  for (const s of allSettlements) {
    const zoneName = (s.zone ?? "").trim();
    if (!zoneName) continue;
    const key = zoneName.toLowerCase();
    const entry = byKey.get(key) ?? { key, name: zoneName, settlementIds: [] };
    entry.settlementIds.push(s.id);
    byKey.set(key, entry);
  }
  const zones = Array.from(byKey.values());
  zones.sort((a, b) => a.name.localeCompare(b.name));
  for (const z of zones) z.settlementIds.sort((a, b) => a.localeCompare(b));
  return zones;
}

export async function handleSelfAssignMenus(interaction: StringSelectMenuInteraction, store: StateStore) {
  if (!interaction.inCachedGuild()) return;
  if (!interaction.customId.startsWith("selfassign:")) return;

  const guildId = interaction.guildId;
  const member = interaction.member;
  const gs = store.get().guilds[guildId];
  if (!gs) {
    await interaction.reply({
      content: "Server is not initialized. Ask an admin to run `/setup init`.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const allSettlements = settlements(store, guildId);
  const zones = zonesFromSettlements(allSettlements);

  if (interaction.customId === "selfassign:citizen_zone") {
    const value = interaction.values[0] ?? "none";
    const citizenRoleIds = allSettlements.map((s) => s.citizenRoleId).filter(Boolean) as string[];

    if (value === "none") {
      await member.roles.remove(citizenRoleIds).catch(() => null);
      await interaction.reply({ content: "Citizenship cleared.", flags: MessageFlags.Ephemeral });
      return;
    }

    const zone = zones.find((z) => z.key === value) ?? null;
    if (!zone) {
      await interaction.reply({ content: "That zone is not configured yet.", flags: MessageFlags.Ephemeral });
      return;
    }

    const menu = new StringSelectMenuBuilder()
      .setCustomId(`selfassign:citizen_settlement:${zone.key}`)
      .setPlaceholder(`Select your settlement in ${zone.name}`)
      .setMinValues(1)
      .setMaxValues(1);

    const zoneSettlements = zone.settlementIds.map((id) => gs.settlements[id]).filter(Boolean) as Settlement[];
    zoneSettlements.sort((a, b) => a.name.localeCompare(b.name));
    for (const s of zoneSettlements.slice(0, 25)) {
      menu.addOptions(new StringSelectMenuOptionBuilder().setLabel(s.name).setValue(s.id));
    }

    await interaction.reply({
      content: `Pick your settlement for **${zone.name}**:`,
      components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (interaction.customId.startsWith("selfassign:citizen_settlement:")) {
    const zoneKey = interaction.customId.split(":").slice(2).join(":");
    const settlementId = interaction.values[0] ?? "";
    const settlement = gs.settlements[settlementId] as Settlement | undefined;
    if (!settlement?.citizenRoleId) {
      await interaction.reply({ content: "That settlement is not configured yet.", flags: MessageFlags.Ephemeral });
      return;
    }
    if ((settlement.zone ?? "").trim().toLowerCase() !== zoneKey) {
      await interaction.reply({
        content: "That settlement does not belong to the selected zone.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const citizenRoleIds = allSettlements.map((s) => s.citizenRoleId).filter(Boolean) as string[];
    const toRemove = citizenRoleIds.filter((id) => id !== settlement.citizenRoleId);
    await member.roles.remove(toRemove).catch(() => null);
    await member.roles.add(settlement.citizenRoleId).catch(() => null);
    await interaction.reply({ content: `Set citizenship to **${settlement.name}**.`, flags: MessageFlags.Ephemeral });
    return;
  }

  if (interaction.customId === "selfassign:view_zone") {
    const zoneKey = interaction.values[0] ?? "";
    const zone = zones.find((z) => z.key === zoneKey) ?? null;
    if (!zone) {
      await interaction.reply({ content: "That zone is not configured yet.", flags: MessageFlags.Ephemeral });
      return;
    }

    const zoneSettlements = zone.settlementIds.map((id) => gs.settlements[id]).filter(Boolean) as Settlement[];
    zoneSettlements.sort((a, b) => a.name.localeCompare(b.name));

    const menu = new StringSelectMenuBuilder()
      .setCustomId(`selfassign:view_settlements:${zone.key}`)
      .setPlaceholder(`Select settlements to view in ${zone.name} (read-only)`)
      .setMinValues(1)
      .setMaxValues(Math.min(25, zoneSettlements.length + 1));

    menu.addOptions(new StringSelectMenuOptionBuilder().setLabel("Clear all (for this zone)").setValue("__clear__"));
    for (const s of zoneSettlements.slice(0, 24)) {
      menu.addOptions(new StringSelectMenuOptionBuilder().setLabel(s.name).setValue(s.id));
    }

    await interaction.reply({
      content: `Select which settlement chats you want to view (read-only) for **${zone.name}**:`,
      components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (interaction.customId.startsWith("selfassign:view_settlements:")) {
    const zoneKey = interaction.customId.split(":").slice(2).join(":");
    const zone = zones.find((z) => z.key === zoneKey) ?? null;
    if (!zone) {
      await interaction.reply({ content: "That zone is not configured yet.", flags: MessageFlags.Ephemeral });
      return;
    }

    const zoneSettlements = zone.settlementIds.map((id) => gs.settlements[id]).filter(Boolean) as Settlement[];
    const zoneViewRoleIds = zoneSettlements.map((s) => s.viewRoleId).filter(Boolean) as string[];

    const selectedSettlementIds = new Set(interaction.values);
    if (selectedSettlementIds.has("__clear__")) {
      await member.roles.remove(zoneViewRoleIds).catch(() => null);
      await interaction.reply({
        content: `Cleared settlement views for **${zone.name}**.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const selectedRoleIds = zoneSettlements
      .filter((s) => selectedSettlementIds.has(s.id))
      .map((s) => s.viewRoleId)
      .filter(Boolean) as string[];

    const toRemove = zoneViewRoleIds.filter((rid) => !selectedRoleIds.includes(rid));
    await member.roles.remove(toRemove).catch(() => null);
    await member.roles.add(selectedRoleIds).catch(() => null);

    await interaction.reply({
      content: `Updated settlement views for **${zone.name}**.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (interaction.customId === "selfassign:citizen") {
    const value = interaction.values[0] ?? "none";
    const citizenRoleIds = allSettlements.map((s) => s.citizenRoleId).filter(Boolean) as string[];

    if (value === "none") {
      await member.roles.remove(citizenRoleIds).catch(() => null);
      await interaction.reply({ content: "Citizenship cleared.", flags: MessageFlags.Ephemeral });
      return;
    }

    const settlement = gs.settlements[value] as Settlement | undefined;
    if (!settlement?.citizenRoleId) {
      await interaction.reply({ content: "That settlement is not configured yet.", flags: MessageFlags.Ephemeral });
      return;
    }

    // Enforce 1-citizen-settlement rule
    const toRemove = citizenRoleIds.filter((id) => id !== settlement.citizenRoleId);
    await member.roles.remove(toRemove).catch(() => null);
    await member.roles.add(settlement.citizenRoleId).catch(() => null);
    await interaction.reply({ content: `Set citizenship to **${settlement.name}**.`, flags: MessageFlags.Ephemeral });
    return;
  }

  if (interaction.customId === "selfassign:view") {
    const selectedSettlementIds = new Set(interaction.values);
    const viewRoles = allSettlements
      .map((s) => ({ id: s.id, roleId: s.viewRoleId, name: s.name }))
      .filter((x) => !!x.roleId) as { id: string; roleId: string; name: string }[];

    const selectedRoleIds = viewRoles.filter((x) => selectedSettlementIds.has(x.id)).map((x) => x.roleId);
    const allViewRoleIds = viewRoles.map((x) => x.roleId);

    // Remove unselected view roles, add selected
    const toRemove = allViewRoleIds.filter((rid) => !selectedRoleIds.includes(rid));
    await member.roles.remove(toRemove).catch(() => null);
    await member.roles.add(selectedRoleIds).catch(() => null);

    await interaction.reply({ content: "Updated your view preferences.", flags: MessageFlags.Ephemeral });
    return;
  }

  if (interaction.customId === "selfassign:zoneview") {
    const zoneViewRoleIds = gs.config.zoneViewRoleIds ?? {};
    const entries = Object.entries(zoneViewRoleIds).filter(([, roleId]) => !!roleId);
    if (!entries.length) {
      await interaction.reply({
        content: "Zone view roles are not configured yet. Ask an admin to run `/setup init` again.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const selectedKeys = new Set(interaction.values);
    const selectedRoleIds = entries.filter(([key]) => selectedKeys.has(key)).map(([, roleId]) => roleId);
    const allRoleIds = entries.map(([, roleId]) => roleId);

    const toRemove = allRoleIds.filter((rid) => !selectedRoleIds.includes(rid));
    await member.roles.remove(toRemove).catch(() => null);
    await member.roles.add(selectedRoleIds).catch(() => null);

    await interaction.reply({ content: "Updated your zone view preferences.", flags: MessageFlags.Ephemeral });
    return;
  }
}
