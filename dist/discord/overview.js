"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.upsertGuildOverview = upsertGuildOverview;
const discord_js_1 = require("discord.js");
const tiers_1 = require("./tiers");
async function ensureBotCanPost(guild, text) {
    const bot = guild.members.me ?? (await guild.members.fetchMe().catch(() => null));
    if (!bot)
        return;
    await text.permissionOverwrites
        .edit(bot.id, {
        ViewChannel: true,
        SendMessages: true,
        EmbedLinks: true,
        ReadMessageHistory: true,
    })
        .catch(() => null);
}
function buildOverviewEmbed(guild, settlements) {
    const lines = settlements
        .sort((a, b) => b.tier - a.tier || a.name.localeCompare(b.name))
        .map((s) => {
        const mayor = s.mayorUserId ? `<@${s.mayorUserId}>` : "-";
        const mayorGuild = s.mayorGuildName?.trim() ? ` (Guild: **${s.mayorGuildName.trim()}**)` : "";
        const link = s.channelId ? `https://discord.com/channels/${guild.id}/${s.channelId}` : null;
        const namePart = link ? `[${s.name}](${link})` : `**${s.name}**`;
        return `${namePart} - Tier **${s.tier}** (${(0, tiers_1.tierName)(s.tier)}) - Mayor ${mayor}${mayorGuild}`;
    });
    return new discord_js_1.EmbedBuilder()
        .setTitle(`${guild.name} - Server Overview`)
        .setColor(0x6a5acd)
        .setDescription(lines.length ? lines.join("\n") : "No settlements yet. Use `/settlement add`.")
        .setFooter({ text: "VerraVoice" })
        .setTimestamp(new Date());
}
async function upsertGuildOverview(guild, store) {
    const gs = store.get().guilds[guild.id];
    if (!gs)
        return;
    const channelId = gs.config.overviewChannelId ?? gs.config.announcementsChannelId;
    if (!channelId)
        return;
    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (!channel || channel.type !== discord_js_1.ChannelType.GuildText) {
        await store.update(async (state) => {
            const g = state.guilds[guild.id];
            if (!g)
                return;
            if (g.config.overviewChannelId === channelId) {
                g.config.overviewChannelId = null;
                g.config.overviewMessageId = null;
            }
        });
        return;
    }
    const text = channel;
    await ensureBotCanPost(guild, text);
    const settlements = Object.values(gs.settlements ?? {});
    const embed = buildOverviewEmbed(guild, settlements);
    const messageId = gs.config.overviewMessageId;
    if (messageId) {
        const msg = await text.messages.fetch(messageId).catch(() => null);
        if (msg) {
            await msg.edit({ embeds: [embed] }).catch(() => null);
            return;
        }
    }
    const msg = await text.send({ embeds: [embed] }).catch(() => null);
    if (!msg)
        return;
    await store.update(async (state) => {
        const g = state.guilds[guild.id];
        if (!g)
            return;
        g.config.overviewMessageId = msg.id;
        g.config.overviewChannelId = text.id;
    });
}
