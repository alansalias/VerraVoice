import { EmbedBuilder } from "discord.js";

export function buildSelfAssignEmbed() {
  return new EmbedBuilder()
    .setTitle("Self-Assign Roles")
    .setColor(0x2b90d9)
    .setDescription(
      [
        "Use the menus below to tell the server who you are and what you want to see.",
        "",
        "**Citizen (one settlement only)**",
        "- Pick a zone, then pick your settlement to get its citizen role.",
        "- You can only be a citizen of **one** settlement at a time (changing it will remove the previous citizen role).",
        "",
        "**View other zones (optional)**",
        "- Opt-in to view all settlements for a zone/biome (read-only).",
        "",
        "**View specific settlements (optional)**",
        "- Use the zone picker to select individual settlement chats to view (read-only).",
        "",
        "**Guild leadership roles (request)**",
        "- Use the buttons to request `Guild Leader` or `Guild Officer`.",
        "- A moderator will review the request.",
      ].join("\n"),
    )
    .setFooter({ text: "VerraVoice" });
}
