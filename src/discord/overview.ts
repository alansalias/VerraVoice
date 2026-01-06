import { ChannelType, EmbedBuilder, Guild, TextChannel } from "discord.js";
import { Settlement } from "../state/schema";
import { StateStore } from "../state/store";
import { tierName } from "./tiers";

async function ensureBotCanPost(guild: Guild, text: TextChannel) {
  const bot = guild.members.me ?? (await guild.members.fetchMe().catch(() => null));
  if (!bot) return;
  await text.permissionOverwrites
    .edit(bot.id, {
      ViewChannel: true,
      SendMessages: true,
      EmbedLinks: true,
      ReadMessageHistory: true,
    })
    .catch(() => null);
}

function buildOverviewEmbed(guild: Guild, settlements: Settlement[]) {
  const lines = settlements
    .sort((a, b) => b.tier - a.tier || a.name.localeCompare(b.name))
    .map((s) => {
      const mayor = s.mayorUserId ? `<@${s.mayorUserId}>` : "-";
      const mayorGuild = s.mayorGuildName?.trim() ? ` (Guild: **${s.mayorGuildName.trim()}**)` : "";
      return `**${s.name}** - tier **${s.tier}** (${tierName(s.tier)}) - mayor ${mayor}${mayorGuild}`;
    });

  return new EmbedBuilder()
    .setTitle(`${guild.name} - Server Overview`)
    .setColor(0x6a5acd)
    .setDescription(lines.length ? lines.join("\n") : "No settlements yet. Use `/settlement add`.")
    .setFooter({ text: "VerraVoice" })
    .setTimestamp(new Date());
}

export async function upsertGuildOverview(guild: Guild, store: StateStore) {
  const gs = store.get().guilds[guild.id];
  if (!gs) return;

  const channelId = gs.config.overviewChannelId ?? gs.config.announcementsChannelId;
  if (!channelId) return;

  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildText) {
    await store.update(async (state) => {
      const g = state.guilds[guild.id];
      if (!g) return;
      if (g.config.overviewChannelId === channelId) {
        g.config.overviewChannelId = null;
        g.config.overviewMessageId = null;
      }
    });
    return;
  }
  const text = channel as TextChannel;
  await ensureBotCanPost(guild, text);

  const settlements = Object.values(gs.settlements ?? {}) as Settlement[];
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
  if (!msg) return;
  await store.update(async (state) => {
    const g = state.guilds[guild.id];
    if (!g) return;
    g.config.overviewMessageId = msg.id;
    g.config.overviewChannelId = text.id;
  });
}
