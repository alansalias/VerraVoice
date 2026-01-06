import { EmbedBuilder } from "discord.js";

export function buildRulesEmbed() {
  return new EmbedBuilder()
    .setTitle("Server Rules")
    .setColor(0x5865f2)
    .setDescription(
      [
        "Welcome to the community. Keep it fun, fair, and useful for Ashes of Creation players.",
        "",
        "**1) Be respectful**",
        "- No harassment, hate speech, slurs, or personal attacks.",
        "",
        "**2) Keep it safe**",
        "- No doxxing, threats, or sharing personal info (yours or others).",
        "- No NSFW content.",
        "",
        "**3) Follow Discord & AoC terms**",
        "- No cheating, real-money trading, or instructions to exploit.",
        "- No piracy or illegal content.",
        "",
        "**4) Keep channels on-topic**",
        "- Use the correct channels for trading/LFG/recruitment.",
        "- Avoid spam and excessive pings.",
        "",
        "**5) Moderation**",
        "- Mods may remove content and take action to keep the community healthy.",
        "- If you disagree with a decision, appeal calmly via DM/ticket (if available).",
      ].join("\n"),
    )
    .setFooter({ text: "VerraVoice" });
}

