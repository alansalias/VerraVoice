import { EmbedBuilder } from "discord.js";

export function buildMayorInfoEmbed() {
  return new EmbedBuilder()
    .setTitle("Mayor Verification - How It Works")
    .setColor(0x3aa57c)
    .setDescription(
      [
        "Use this to verify who is the current mayor for a settlement and grant the correct Discord role.",
        "",
        "**How to request**",
        "- Click the **Start Mayor Claim** button below.",
        "- You'll fill out a short form (settlement + guild name + note).",
        "- Then the bot will DM you to collect your **proof image** (screenshot).",
        "",
        "Alternative (fallback): you can still use `/mayor claim` (includes proof upload as an attachment).",
        "",
        "**Review**",
        "- Requests are reviewed by the moderation team.",
        "- When approved, the bot assigns the `Mayor of <Settlement>` role and updates the settlement status card.",
        "",
        "**Rules**",
        "- Only one verified mayor per settlement at a time.",
        "- False claims may be denied and can lead to moderation action.",
      ].join("\n"),
    )
    .setFooter({ text: "VerraVoice" });
}
