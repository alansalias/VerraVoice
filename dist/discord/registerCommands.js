"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerCommands = registerCommands;
const v10_1 = require("discord-api-types/v10");
const discord_js_1 = require("discord.js");
const registry_1 = require("./commands/registry");
async function registerCommands(opts) {
    const rest = new discord_js_1.REST({ version: "10" }).setToken(opts.token);
    const body = (0, registry_1.commandsJson)();
    const mode = opts.mode ?? (opts.devGuildId ? "guild" : "global");
    const cleanup = opts.cleanup ?? false;
    if (mode === "guild") {
        if (!opts.devGuildId) {
            throw new Error("COMMANDS_MODE=guild requires DEV_GUILD_ID.");
        }
        opts.logger.info(`Registering guild commands for ${opts.devGuildId}...`);
        await rest.put(v10_1.Routes.applicationGuildCommands(opts.clientId, opts.devGuildId), { body });
        if (cleanup) {
            opts.logger.info("Cleaning up global commands to avoid duplicates...");
            await rest.put(v10_1.Routes.applicationCommands(opts.clientId), { body: [] });
        }
        return;
    }
    opts.logger.info("Registering global commands (may take up to 1h to appear)...");
    await rest.put(v10_1.Routes.applicationCommands(opts.clientId), { body });
    if (cleanup && opts.devGuildId) {
        opts.logger.info(`Cleaning up guild commands for ${opts.devGuildId} to avoid duplicates...`);
        await rest.put(v10_1.Routes.applicationGuildCommands(opts.clientId, opts.devGuildId), { body: [] });
    }
}
