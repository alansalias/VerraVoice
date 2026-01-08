import { EmbedBuilder } from "discord.js";

export function buildRulesEmbed() {
  return new EmbedBuilder()
    .setTitle("Server Rules")
    .setColor(0x5865f2)
    .setDescription(
      [
        "Welcome to the community. Keep it fun, fair, and useful for Ashes of Creation players.",
        "",
        "**Rules**",
        "- Be Respectful: Treat others kindly; no harassment or toxicity.",
        "- Follow Discord’s Terms of Service: Read them here.",
        "- Stay On-Topic: Use channels as intended to keep things organized.",
        "- No Politics: Keep political discussions out of the server to avoid unnecessary tension.",
        "- No Spamming: Avoid cluttering channels with unnecessary posts.",
        "- Play Fair: No cheating, exploiting, or promoting game-breaking behavior.",
        "- Promote Responsibly: Share your content only in designated areas.",
        "- Report Issues: Let moderators know if something’s wrong.",
        "- English language only, please.",
      ].join("\n"),
    )
    .setFooter({ text: "VerraVoice" });
}

