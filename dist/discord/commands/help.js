"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleHelp = void 0;
const discord_js_1 = require("discord.js");
const v10_1 = require("discord-api-types/v10");
const handleHelp = async ({ interaction }) => {
    if (interaction.commandName !== "help")
        return;
    const embed = new discord_js_1.EmbedBuilder()
        .setTitle("VerraVoice: quick help")
        .setColor(0x5865f2)
        .setDescription([
        "Key commands:",
        "- `/setup init` (admins): create/repair channels + roles.",
        "- `/setup timezone` (admins): set the server timezone.",
        "- `/setup populate` (admins): create settlement structure from catalog.",
        "- `/settlement ...` (admins/mayors): manage settlements and announcements.",
        "- `/mayor claim` (users): request mayor; staff approve via buttons.",
        "- `/ginvite` (guild leaders/officers): give your guild role to a member.",
        "",
        "If something looks off, ask an admin to run `/setup init` or `/setup status`.",
    ].join("\n"));
    await interaction.reply({ embeds: [embed], flags: v10_1.MessageFlags.Ephemeral }).catch(() => null);
};
exports.handleHelp = handleHelp;
