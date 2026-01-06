import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  ModalSubmitInteraction,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { MessageFlags } from "discord-api-types/v10";
import { Logger } from "../../logger";
import { MayorRequest, Settlement } from "../../state/schema";
import { StateStore } from "../../state/store";
import { newId } from "../../utils/ids";

function findSettlement(guildState: any, input: string): Settlement | null {
  const byId = guildState?.settlements?.[input];
  if (byId) return byId;
  const lower = input.toLowerCase().trim();
  for (const settlement of Object.values(guildState?.settlements ?? {}) as Settlement[]) {
    if (settlement.name.toLowerCase() === lower) return settlement;
  }
  return null;
}

function startMayorClaimButton() {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("mayorclaim:open").setLabel("Start Mayor Claim").setStyle(ButtonStyle.Primary),
  );
}

export function mayorClaimComponents() {
  return [startMayorClaimButton()];
}

export async function handleMayorClaimButtons(opts: { interaction: ButtonInteraction; store: StateStore; logger: Logger }) {
  const { interaction } = opts;
  if (!interaction.inCachedGuild()) return;
  if (interaction.customId !== "mayorclaim:open") return;

  const modal = new ModalBuilder().setCustomId("mayorclaimmodal").setTitle("Mayor Claim Request");

  const settlement = new TextInputBuilder()
    .setCustomId("settlement")
    .setLabel("Settlement name")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(64);

  const guildName = new TextInputBuilder()
    .setCustomId("guild_name")
    .setLabel("Your in-game guild name")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(80);

  const note = new TextInputBuilder()
    .setCustomId("note")
    .setLabel("Short note for moderators")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(600);

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(settlement),
    new ActionRowBuilder<TextInputBuilder>().addComponents(guildName),
    new ActionRowBuilder<TextInputBuilder>().addComponents(note),
  );

  await interaction.showModal(modal);
}

function buildDmProofRequestEmbed(opts: {
  guildName: string;
  settlementName: string;
  requestId: string;
  note: string;
}) {
  return new EmbedBuilder()
    .setTitle("Mayor claim proof required")
    .setColor(0x3aa57c)
    .setDescription(
      [
        `Server: **${opts.guildName}**`,
        `Settlement: **${opts.settlementName}**`,
        "",
        "Please reply to this DM with **one image attachment** (screenshot proof).",
        "",
        `Request ID: \`${opts.requestId}\``,
        "",
        "If you have multiple pending mayor claims across different servers, include the request id in your message so I can match it.",
        "",
        "Tip: If your DMs are blocked, you can instead use `/mayor claim` in the server.",
      ].join("\n"),
    )
    .addFields({ name: "Your note", value: opts.note || "-" })
    .setFooter({ text: "VerraVoice" });
}

export async function handleMayorClaimModal(opts: { interaction: ModalSubmitInteraction; store: StateStore; logger: Logger }) {
  const { interaction, store } = opts;
  if (!interaction.inCachedGuild()) return;
  if (interaction.customId !== "mayorclaimmodal") return;

  const gs = store.get().guilds[interaction.guildId];
  if (!gs) {
    await interaction.reply({
      content: "Server is not initialized. Ask an admin to run `/setup init`.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const settlementInput = interaction.fields.getTextInputValue("settlement").trim();
  const guildName = interaction.fields.getTextInputValue("guild_name").trim();
  const note = interaction.fields.getTextInputValue("note").trim();

  if (!settlementInput || !guildName || !note) {
    await interaction.reply({ content: "Settlement, guild name, and note are required.", flags: MessageFlags.Ephemeral });
    return;
  }

  const settlement = findSettlement(gs, settlementInput);
  if (!settlement) {
    await interaction.reply({
      content: "Settlement not found. Use the exact name from the settlement list.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const requestId = newId("mayorreq");
  const createdAtMs = Date.now();

  const req: MayorRequest = {
    id: requestId,
    settlementId: settlement.id,
    requesterUserId: interaction.user.id,
    guildName,
    note,
    proofUrl: "",
    proofFilename: null,
    proofContentType: null,
    proofSize: null,
    status: "pending",
    createdAtMs,
    reviewedAtMs: null,
    reviewedByUserId: null,
  };

  await store.update(async (state) => {
    const g = state.guilds[interaction.guildId];
    if (!g) return;
    g.mayorRequests[requestId] = req;
  });

  await interaction.reply({
    content: `Mayor claim created (**${requestId}**). Check your DMs to upload proof.`,
    flags: MessageFlags.Ephemeral,
  });

  await interaction.user
    .send({
      embeds: [
        buildDmProofRequestEmbed({
          guildName: interaction.guild.name,
          settlementName: settlement.name,
          requestId,
          note,
        }),
      ],
    })
    .catch(() => null);
}
