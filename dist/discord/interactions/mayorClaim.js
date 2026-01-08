"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mayorClaimComponents = mayorClaimComponents;
exports.handleMayorClaimButtons = handleMayorClaimButtons;
exports.handleMayorClaimModal = handleMayorClaimModal;
const discord_js_1 = require("discord.js");
const v10_1 = require("discord-api-types/v10");
const ids_1 = require("../../utils/ids");
function findSettlement(guildState, input) {
    const byId = guildState?.settlements?.[input];
    if (byId)
        return byId;
    const lower = input.toLowerCase().trim();
    for (const settlement of Object.values(guildState?.settlements ?? {})) {
        if (settlement.name.toLowerCase() === lower)
            return settlement;
    }
    return null;
}
function startMayorClaimButton() {
    return new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.ButtonBuilder().setCustomId("mayorclaim:open").setLabel("Start Mayor Claim").setStyle(discord_js_1.ButtonStyle.Primary));
}
function mayorClaimComponents() {
    return [startMayorClaimButton()];
}
async function handleMayorClaimButtons(opts) {
    const { interaction, store } = opts;
    if (!interaction.inCachedGuild())
        return;
    if (interaction.customId !== "mayorclaim:open")
        return;
    const gs = store.get().guilds[interaction.guildId];
    if (gs && Object.values(gs.settlements ?? {}).some((s) => s.mayorUserId === interaction.user.id)) {
        await interaction.reply({
            content: "You are already a verified mayor. Renounce your current mayorship before requesting another.",
            flags: v10_1.MessageFlags.Ephemeral,
        });
        return;
    }
    const modal = new discord_js_1.ModalBuilder().setCustomId("mayorclaimmodal").setTitle("Mayor Claim Request");
    const settlement = new discord_js_1.TextInputBuilder()
        .setCustomId("settlement")
        .setLabel("Settlement name")
        .setStyle(discord_js_1.TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(64);
    const guildName = new discord_js_1.TextInputBuilder()
        .setCustomId("guild_name")
        .setLabel("Your in-game guild name")
        .setStyle(discord_js_1.TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(80);
    const note = new discord_js_1.TextInputBuilder()
        .setCustomId("note")
        .setLabel("Short note for moderators")
        .setStyle(discord_js_1.TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(600);
    modal.addComponents(new discord_js_1.ActionRowBuilder().addComponents(settlement), new discord_js_1.ActionRowBuilder().addComponents(guildName), new discord_js_1.ActionRowBuilder().addComponents(note));
    await interaction.showModal(modal);
}
function buildDmProofRequestEmbed(opts) {
    return new discord_js_1.EmbedBuilder()
        .setTitle("Mayor claim proof required")
        .setColor(0x3aa57c)
        .setDescription([
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
    ].join("\n"))
        .addFields({ name: "Your note", value: opts.note || "-" })
        .setFooter({ text: "VerraVoice" });
}
async function handleMayorClaimModal(opts) {
    const { interaction, store } = opts;
    if (!interaction.inCachedGuild())
        return;
    if (interaction.customId !== "mayorclaimmodal")
        return;
    const gs = store.get().guilds[interaction.guildId];
    if (!gs) {
        await interaction.reply({
            content: "Server is not initialized. Ask an admin to run `/setup init`.",
            flags: v10_1.MessageFlags.Ephemeral,
        });
        return;
    }
    if (Object.values(gs.settlements ?? {}).some((s) => s.mayorUserId === interaction.user.id)) {
        await interaction.reply({
            content: "You are already a verified mayor. Renounce your current mayorship before requesting another.",
            flags: v10_1.MessageFlags.Ephemeral,
        });
        return;
    }
    const settlementInput = interaction.fields.getTextInputValue("settlement").trim();
    const guildName = interaction.fields.getTextInputValue("guild_name").trim();
    const note = interaction.fields.getTextInputValue("note").trim();
    if (!settlementInput || !guildName || !note) {
        await interaction.reply({ content: "Settlement, guild name, and note are required.", flags: v10_1.MessageFlags.Ephemeral });
        return;
    }
    const settlement = findSettlement(gs, settlementInput);
    if (!settlement) {
        await interaction.reply({
            content: "Settlement not found. Use the exact name from the settlement list.",
            flags: v10_1.MessageFlags.Ephemeral,
        });
        return;
    }
    const requestId = (0, ids_1.newId)("mayorreq");
    const createdAtMs = Date.now();
    const req = {
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
        if (!g)
            return;
        g.mayorRequests[requestId] = req;
    });
    await interaction.reply({
        content: `Mayor claim created (**${requestId}**). Check your DMs to upload proof.`,
        flags: v10_1.MessageFlags.Ephemeral,
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
