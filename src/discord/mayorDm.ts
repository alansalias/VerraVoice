import { EmbedBuilder, Guild } from "discord.js";
import { StateStore } from "../state/store";
import { Settlement } from "../state/schema";

function guildChannelLink(guildId: string, channelId: string) {
  return `https://discord.com/channels/${guildId}/${channelId}`;
}

export async function dmMayorWelcome(opts: {
  guild: Guild;
  store: StateStore;
  mayorUserId: string;
  settlementId: string;
}) {
  const { guild, store, mayorUserId, settlementId } = opts;

  const gs = store.get().guilds[guild.id];
  const settlement = (gs?.settlements?.[settlementId] ?? null) as Settlement | null;
  if (!gs || !settlement) return;

  const mayorHowToChannelId = gs.config.mayorHowToChannelId ?? null;
  const allMayorsChannelId = gs.config.allMayorsChannelId ?? null;
  const zoneKey = (settlement.zone ?? "").trim().toLowerCase();
  const zoneMayorsChannelId = (zoneKey && gs.config.zoneMayorChannelIds?.[zoneKey]) || null;
  const termEnds = settlement.mayorUntilMs ? `<t:${Math.floor(settlement.mayorUntilMs / 1000)}:D>` : null;

  const embed = new EmbedBuilder()
    .setTitle(`Congratulations — you're the Mayor of ${settlement.name}`)
    .setColor(0xf1c40f)
    .setDescription(
      [
        "You're now verified as mayor in this community server.",
        termEnds ? `Your current term ends: ${termEnds}` : null,
        "",
        "**What you can do with VerraVoice**",
        "- Keep your settlement status card up to date: `/settlement update`",
        "- Update tier when it changes: `/settlement set-tier`",
        "- Announce to citizens (optionally ping): `/settlement announce`",
        "- Set election schedules and reminders: `/election set`",
        "- Declare wars and schedule reminders: `/war declare`",
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .addFields(
      ...(mayorHowToChannelId
        ? [
            {
              name: "Mayor guide",
              value: `${guildChannelLink(guild.id, mayorHowToChannelId)}`,
            },
          ]
        : []),
      ...(allMayorsChannelId
        ? [
            {
              name: "All mayors chat",
              value: `${guildChannelLink(guild.id, allMayorsChannelId)}`,
            },
          ]
        : []),
      ...(zoneMayorsChannelId
        ? [
            {
              name: "Your zone mayors channel",
              value: `${guildChannelLink(guild.id, zoneMayorsChannelId)}`,
            },
          ]
        : []),
    )
    .setFooter({ text: "VerraVoice" });

  const member = await guild.members.fetch(mayorUserId).catch(() => null);
  const user = member?.user ?? (await guild.client.users.fetch(mayorUserId).catch(() => null));
  if (!user) return;

  await user.send({ embeds: [embed] }).catch(() => null);
}
