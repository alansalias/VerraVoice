import { EmbedBuilder } from "discord.js";
import { MessageFlags } from "discord-api-types/v10";
import { CommandHandler } from "./types";

export const handleHelp: CommandHandler = async ({ interaction }) => {
  if (interaction.commandName !== "help") return;

  const embed = new EmbedBuilder()
    .setTitle("VerraVoice: quick help")
    .setColor(0x5865f2)
    .setDescription(
      [
        "Key commands:",
        "- `/setup init` (admins): create/repair channels + roles.",
        "- `/setup timezone` (admins): set the server timezone.",
        "- `/setup populate` (admins): create settlement structure from catalog.",
        "- `/settlement ...` (admins/mayors): manage settlements and announcements.",
        "- `/mayor claim` (users): request mayor; staff approve via buttons.",
        "- `/ginvite` (guild leaders/officers): give your guild role to a member.",
        "",
        "If something looks off, ask an admin to run `/setup init` or `/setup status`.",
      ].join("\n"),
    );

  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral }).catch(() => null);
};
