"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startScheduler = startScheduler;
const discord_js_1 = require("discord.js");
function formatOffsetMinutes(offset) {
    if (offset === 0)
        return "Now";
    if (offset % (60 * 24) === 0)
        return `In ${offset / (60 * 24)}d`;
    if (offset % 60 === 0)
        return `In ${offset / 60}h`;
    return `In ${offset}m`;
}
function startScheduler(opts) {
    const tick = async () => {
        const now = Date.now();
        const state = opts.store.get();
        for (const [guildId, guildState] of Object.entries(state.guilds)) {
            const guild = opts.client.guilds.cache.get(guildId);
            if (!guild)
                continue;
            for (const item of Object.values(guildState.schedule ?? {})) {
                for (const offset of item.reminderOffsetsMinutes ?? []) {
                    if (item.sentOffsetMinutes?.includes(offset))
                        continue;
                    const sendAt = item.startsAtMs - offset * 60_000;
                    if (now < sendAt)
                        continue;
                    if (now - sendAt > 5 * 60_000) {
                        // Too late (missed window); mark as sent to avoid spamming after downtime.
                        await opts.store.update(async (s) => {
                            const it = s.guilds[guildId]?.schedule?.[item.id];
                            if (!it)
                                return;
                            it.sentOffsetMinutes = Array.from(new Set([...(it.sentOffsetMinutes ?? []), offset]));
                        });
                        continue;
                    }
                    const channel = await guild.channels.fetch(item.announceChannelId).catch(() => null);
                    if (!channel || channel.type !== discord_js_1.ChannelType.GuildText) {
                        await opts.store.update(async (s) => {
                            const it = s.guilds[guildId]?.schedule?.[item.id];
                            if (!it)
                                return;
                            it.sentOffsetMinutes = Array.from(new Set([...(it.sentOffsetMinutes ?? []), offset]));
                        });
                        continue;
                    }
                    const timeTag = `<t:${Math.floor(item.startsAtMs / 1000)}:F>`;
                    const prefix = formatOffsetMinutes(offset);
                    const mention = item.mentionRoleId ? `<@&${item.mentionRoleId}> ` : "";
                    const description = item.description?.trim() ? `\n${item.description.trim()}` : "";
                    await channel.send({
                        content: `${mention}**${prefix}** - ${item.title} (${timeTag}).${description}`,
                        allowedMentions: item.mentionRoleId ? { roles: [item.mentionRoleId] } : { parse: [] },
                    });
                    await opts.store.update(async (s) => {
                        const it = s.guilds[guildId]?.schedule?.[item.id];
                        if (!it)
                            return;
                        it.sentOffsetMinutes = Array.from(new Set([...(it.sentOffsetMinutes ?? []), offset]));
                    });
                }
            }
        }
    };
    const interval = setInterval(() => {
        void tick().catch((err) => opts.logger.error("Scheduler tick failed", err));
    }, 60_000);
    void tick().catch((err) => opts.logger.error("Scheduler initial tick failed", err));
    return () => clearInterval(interval);
}
