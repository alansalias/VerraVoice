"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.upsertSelfAssignPanel = upsertSelfAssignPanel;
const discord_js_1 = require("discord.js");
const selfAssign_1 = require("./embeds/selfAssign");
function buildCitizenZoneSelect(zones) {
    const menu = new discord_js_1.StringSelectMenuBuilder()
        .setCustomId("selfassign:citizen_zone")
        .setPlaceholder("Set citizenship (pick a zone first)")
        .setMinValues(1)
        .setMaxValues(1);
    menu.addOptions(new discord_js_1.StringSelectMenuOptionBuilder().setLabel("None (clear citizenship)").setValue("none"));
    for (const z of zones.slice(0, 24)) {
        menu.addOptions(new discord_js_1.StringSelectMenuOptionBuilder().setLabel(z.name).setValue(z.key));
    }
    return new discord_js_1.ActionRowBuilder().addComponents(menu);
}
function buildSettlementViewZonePicker(zones) {
    const menu = new discord_js_1.StringSelectMenuBuilder()
        .setCustomId("selfassign:view_zone")
        .setPlaceholder("Optional: configure read-only settlement views (by zone)")
        .setMinValues(1)
        .setMaxValues(1);
    for (const z of zones.slice(0, 25)) {
        menu.addOptions(new discord_js_1.StringSelectMenuOptionBuilder().setLabel(z.name).setValue(z.key));
    }
    return new discord_js_1.ActionRowBuilder().addComponents(menu);
}
function buildZoneViewSelect(zones) {
    const menu = new discord_js_1.StringSelectMenuBuilder()
        .setCustomId("selfassign:zoneview")
        .setPlaceholder("Optional: view other zones (read-only)")
        .setMinValues(0)
        .setMaxValues(Math.min(25, zones.length));
    for (const z of zones.slice(0, 25)) {
        menu.addOptions(new discord_js_1.StringSelectMenuOptionBuilder().setLabel(z.name).setValue(z.key));
    }
    return new discord_js_1.ActionRowBuilder().addComponents(menu);
}
function buildGuildRoleButtons() {
    return new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.ButtonBuilder().setCustomId("rolereq:open:guild_leader").setLabel("Request Guild Leader").setStyle(discord_js_1.ButtonStyle.Primary), new discord_js_1.ButtonBuilder().setCustomId("rolereq:open:guild_officer").setLabel("Request Guild Officer").setStyle(discord_js_1.ButtonStyle.Secondary));
}
async function upsertSelfAssignPanel(guild, store) {
    const gs = store.get().guilds[guild.id];
    const channelId = gs?.config?.selfAssignChannelId ?? null;
    if (!channelId)
        return;
    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (!channel || channel.type !== discord_js_1.ChannelType.GuildText)
        return;
    const text = channel;
    const settlements = Object.values(gs.settlements ?? {});
    settlements.sort((a, b) => a.name.localeCompare(b.name));
    const zones = Array.from(new Set(settlements.map((s) => s.zone).filter((z) => !!z && z.trim().length))).sort((a, b) => a.localeCompare(b));
    const zoneOptions = zones.map((name) => ({ name, key: name.toLowerCase() }));
    const embed = (0, selfAssign_1.buildSelfAssignEmbed)();
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
    if (!msg)
        return;
    await store.update(async (state) => {
        const g = state.guilds[guild.id];
        if (!g)
            return;
        g.config.selfAssignMessageId = msg.id;
    });
}
