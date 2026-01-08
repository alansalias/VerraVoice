"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleWar = void 0;
const luxon_1 = require("luxon");
const v10_1 = require("discord-api-types/v10");
const ids_1 = require("../../utils/ids");
const permissions_1 = require("../permissions");
function parseWhen(input, timezone) {
    const formats = ["yyyy-MM-dd HH:mm", "yyyy-MM-dd H:mm", "yyyy-MM-dd'T'HH:mm", "yyyy-MM-dd'T'HH:mm:ss"];
    for (const fmt of formats) {
        const dt = luxon_1.DateTime.fromFormat(input, fmt, { zone: timezone });
        if (dt.isValid)
            return dt;
    }
    const iso = luxon_1.DateTime.fromISO(input, { zone: timezone });
    if (iso.isValid)
        return iso;
    return null;
}
function findSettlement(guildState, input) {
    const byId = guildState?.settlements?.[input];
    if (byId)
        return byId;
    const lower = input.toLowerCase();
    for (const settlement of Object.values(guildState?.settlements ?? {})) {
        if (settlement.name.toLowerCase() === lower)
            return settlement;
    }
    return null;
}
const handleWar = async ({ interaction, store }) => {
    if (interaction.commandName !== "war")
        return;
    (0, permissions_1.requireGuild)(interaction);
    const sub = interaction.options.getSubcommand();
    const guild = interaction.guild;
    const gs = store.get().guilds[guild.id];
    if (!gs) {
        await interaction.reply({ content: "Run `/setup init` first.", flags: v10_1.MessageFlags.Ephemeral });
        return;
    }
    const admin = (0, permissions_1.isAdmin)(interaction);
    if (sub === "declare") {
        const attackerInput = interaction.options.getString("attacker", true);
        const defenderInput = interaction.options.getString("defender", true);
        const kind = (interaction.options.getString("kind", false) ?? "war");
        const attacker = findSettlement(gs, attackerInput);
        const defender = findSettlement(gs, defenderInput);
        if (!attacker || !defender) {
            await interaction.reply({ content: "Attacker/defender settlement not found.", flags: v10_1.MessageFlags.Ephemeral });
            return;
        }
        if (attacker.id === defender.id) {
            await interaction.reply({ content: "Attacker and defender must be different settlements.", flags: v10_1.MessageFlags.Ephemeral });
            return;
        }
        if (!(0, permissions_1.canManageSettlement)(interaction.member, attacker, admin)) {
            await interaction.reply({
                content: "Only the attacking settlement mayor (or an admin) can declare wars for this settlement.",
                flags: v10_1.MessageFlags.Ephemeral,
            });
            return;
        }
        const startsAtInput = interaction.options.getString("starts_at", true).trim();
        const title = interaction.options.getString("title", true).trim();
        const description = interaction.options.getString("description", false);
        const mentionRole = interaction.options.getRole("mention_role", false);
        const announceChannel = interaction.options.getChannel("announce_channel", false);
        const timezone = gs.config.timezone || "UTC";
        const dt = parseWhen(startsAtInput, timezone);
        if (!dt) {
            await interaction.reply({
                content: `Couldn't parse time.\nUse \`YYYY-MM-DD HH:mm\` in your server timezone (**${timezone}**) e.g. \`2026-02-10 20:00\`.\nAlso accepted: ISO \`2026-02-10T20:00\` (24h).`,
                flags: v10_1.MessageFlags.Ephemeral,
            });
            return;
        }
        if (dt.toMillis() <= Date.now()) {
            await interaction.reply({ content: "Start time must be in the future.", flags: v10_1.MessageFlags.Ephemeral });
            return;
        }
        const announceChannelId = announceChannel?.isTextBased() ? announceChannel.id : gs.config.announcementsChannelId ?? interaction.channelId;
        if (!announceChannelId) {
            await interaction.reply({ content: "No announcements channel configured. Run `/setup init` first.", flags: v10_1.MessageFlags.Ephemeral });
            return;
        }
        const id = (0, ids_1.newId)("war");
        await store.update(async (state) => {
            const g = state.guilds[guild.id];
            if (!g)
                return;
            g.schedule[id] = {
                id,
                type: "war",
                settlementId: attacker.id,
                warDefenderSettlementId: defender.id,
                warKind: kind,
                discordEventId: null,
                title: `${kind === "siege" ? "Siege" : "War"}: ${attacker.name} vs ${defender.name} - ${title}`,
                description: description ?? null,
                announceChannelId,
                mentionRoleId: mentionRole?.id ?? null,
                startsAtMs: dt.toMillis(),
                reminderOffsetsMinutes: [1440, 60, 15, 0],
                sentOffsetMinutes: [],
                createdByUserId: interaction.user.id,
                createdAtMs: Date.now(),
            };
        });
        const chan = await guild.channels.fetch(announceChannelId).catch(() => null);
        if (chan?.isTextBased()) {
            const mention = mentionRole ? `<@&${mentionRole.id}> ` : "";
            const desc = description?.trim() ? `\n${description.trim()}` : "";
            const kindLabel = kind === "siege" ? "Siege" : "War";
            await chan.send({
                content: `${mention}**${kindLabel} declared**: **${attacker.name}** (attacker) vs **${defender.name}** (defender) — ${title}\nStarts at <t:${Math.floor(dt.toSeconds())}:F>.${desc}`,
                allowedMentions: mentionRole ? { roles: [mentionRole.id] } : { parse: [] },
            });
        }
        await interaction.reply({
            content: `${kind === "siege" ? "Siege" : "War"} scheduled (**${id}**) for **${attacker.name}** vs **${defender.name}** at <t:${Math.floor(dt.toSeconds())}:F>.`,
            flags: v10_1.MessageFlags.Ephemeral,
        });
        return;
    }
};
exports.handleWar = handleWar;
