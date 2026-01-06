import { Attachment, ChannelType, EmbedBuilder, Message, TextChannel } from "discord.js";
import { Logger } from "../../logger";
import { MayorRequest, Settlement } from "../../state/schema";
import { StateStore } from "../../state/store";

function isImageAttachment(att: Attachment) {
  if (att.contentType?.startsWith("image/")) return true;
  return /\.(png|jpe?g|gif|webp)$/i.test(att.url);
}

function extractRequestId(text: string) {
  const m = text.match(/mayorreq_[0-9a-f-]{36}/i);
  return m ? m[0] : null;
}

function buildMayorRequestEmbed(opts: {
  requestId: string;
  settlementName: string;
  requesterUserId: string;
  guildName: string;
  note: string;
  proofUrl: string;
}) {
  return new EmbedBuilder()
    .setTitle(`Mayor claim: ${opts.settlementName}`)
    .setColor(0xf1c40f)
    .addFields(
      { name: "Request ID", value: opts.requestId, inline: true },
      { name: "User", value: `<@${opts.requesterUserId}>`, inline: true },
      { name: "Guild", value: opts.guildName, inline: true },
      { name: "Note", value: opts.note || "-" },
    )
    .setImage(opts.proofUrl)
    .setFooter({ text: "Approve/Deny using the buttons below." });
}

function reviewButtons(requestId: string) {
  return [
    {
      type: 1,
      components: [
        { type: 2, custom_id: `mayorreq:approve:${requestId}`, label: "Approve", style: 3 },
        { type: 2, custom_id: `mayorreq:deny:${requestId}`, label: "Deny", style: 4 },
      ],
    },
  ] as any;
}

type Pending = { guildId: string; request: MayorRequest; settlement: Settlement };

function pendingRequestsForUser(store: StateStore, userId: string): Pending[] {
  const pending: Pending[] = [];
  for (const [guildId, gs] of Object.entries(store.get().guilds)) {
    for (const req of Object.values(gs.mayorRequests ?? {}) as MayorRequest[]) {
      if (req.requesterUserId !== userId) continue;
      if (req.status !== "pending") continue;
      if (req.proofUrl && req.proofUrl.trim().length) continue;
      const settlement = (gs.settlements?.[req.settlementId] ?? null) as Settlement | null;
      if (!settlement) continue;
      pending.push({ guildId, request: req, settlement });
    }
  }
  pending.sort((a, b) => b.request.createdAtMs - a.request.createdAtMs);
  return pending;
}

export async function handleMayorProofDmMessage(opts: { message: Message; store: StateStore; logger: Logger }) {
  const { message, store } = opts;
  if (message.author.bot) return;
  if (message.channel.type !== ChannelType.DM) return;

  const attachment = message.attachments.find((a) => isImageAttachment(a)) ?? null;
  if (!attachment) return;

  const userId = message.author.id;
  const candidates = pendingRequestsForUser(store, userId);
  if (!candidates.length) {
    await message
      .reply("I couldn't find a pending mayor claim for you. Start one from the server via the **Start Mayor Claim** button (or `/mayor claim`).")
      .catch(() => null);
    return;
  }

  const requestedId = extractRequestId(message.content ?? "");
  const chosen =
    (requestedId ? candidates.find((c) => c.request.id === requestedId) ?? null : null) ??
    (candidates.length === 1 ? candidates[0] : null);

  if (!chosen) {
    const lines = candidates.slice(0, 10).map((c) => `- \`${c.request.id}\` (${c.settlement.name} in ${c.guildId})`);
    await message
      .reply(`You have multiple pending mayor claims. Reply again with the request id:\n${lines.join("\n")}`)
      .catch(() => null);
    return;
  }

  const { guildId, request, settlement } = chosen;
  const gs = store.get().guilds[guildId];
  const requestsChannelId = gs?.config?.requestsChannelId ?? null;
  if (!gs || !requestsChannelId) {
    await message.reply("That server is not configured yet. Ask an admin to run `/setup init`.").catch(() => null);
    return;
  }

  // Persist proof onto the request
  await store.update(async (state) => {
    const r = state.guilds[guildId]?.mayorRequests?.[request.id];
    if (!r) return;
    r.proofUrl = attachment.url;
    r.proofFilename = attachment.name ?? null;
    r.proofContentType = attachment.contentType ?? null;
    r.proofSize = attachment.size ?? null;
  });

  const guild = await message.client.guilds.fetch(guildId).catch(() => null);
  if (!guild) {
    await message.reply("I couldn't access that server anymore (maybe I'm no longer in it).").catch(() => null);
    return;
  }

  const chan = await guild.channels.fetch(requestsChannelId).catch(() => null);
  if (!chan || chan.type !== ChannelType.GuildText) {
    await message.reply("The server's `#requests` channel is missing. Ask an admin to run `/setup init` again.").catch(() => null);
    return;
  }

  await (chan as TextChannel)
    .send({
      embeds: [
        buildMayorRequestEmbed({
          requestId: request.id,
          settlementName: settlement.name,
          requesterUserId: userId,
          guildName: request.guildName,
          note: request.note,
          proofUrl: attachment.url,
        }),
      ],
      components: reviewButtons(request.id),
      allowedMentions: { parse: [] },
    })
    .catch(() => null);

  await message
    .reply(
      `Proof received for **${settlement.name}** (request \`${request.id}\`). Your request has been sent to the moderators for review.`,
    )
    .catch(() => null);
}

