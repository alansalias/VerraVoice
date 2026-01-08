"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleAutocomplete = handleAutocomplete;
async function handleAutocomplete(interaction, store) {
    if (!interaction.inCachedGuild())
        return;
    const gs = store.get().guilds[interaction.guildId];
    if (!gs) {
        await interaction.respond([]);
        return;
    }
    const focused = interaction.options.getFocused(true);
    if (focused.name !== "settlement" && focused.name !== "attacker" && focused.name !== "defender") {
        await interaction.respond([]);
        return;
    }
    const query = String(focused.value ?? "").toLowerCase();
    const settlements = Object.values(gs.settlements ?? {});
    const matches = settlements
        .filter((s) => !query || s.name.toLowerCase().includes(query) || s.id.toLowerCase().includes(query))
        .slice(0, 25)
        .map((s) => ({ name: s.name, value: s.id }));
    await interaction.respond(matches);
}
