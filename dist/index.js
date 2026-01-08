"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const discord_js_1 = require("discord.js");
const v10_1 = require("discord-api-types/v10");
const node_path_1 = __importDefault(require("node:path"));
const config_1 = require("./config");
const logger_1 = require("./logger");
const autocomplete_1 = require("./discord/autocomplete");
const registry_1 = require("./discord/commands/registry");
const registerCommands_1 = require("./discord/registerCommands");
const scheduler_1 = require("./scheduler/scheduler");
const store_1 = require("./state/store");
const mayorRequests_1 = require("./discord/buttons/mayorRequests");
const overview_1 = require("./discord/overview");
const selfAssign_1 = require("./discord/menus/selfAssign");
const roleRequests_1 = require("./discord/interactions/roleRequests");
const mayorAggregate_1 = require("./discord/mayorAggregate");
const mayorClaim_1 = require("./discord/interactions/mayorClaim");
const mayorProof_1 = require("./discord/dm/mayorProof");
const mayorDashboard_1 = require("./discord/interactions/mayorDashboard");
const guildRoles_1 = require("./discord/guildRoles");
const health_1 = require("./health");
const config = (0, config_1.loadConfig)(process.env);
const logger = new logger_1.Logger(config.LOG_LEVEL ?? "info");
const dataDir = node_path_1.default.resolve(config.DATA_DIR ?? "data");
const store = new store_1.StateStore(dataDir);
process.on("unhandledRejection", (reason) => {
    logger.error("Unhandled rejection", reason);
});
process.on("uncaughtException", (err) => {
    logger.error("Uncaught exception", err);
    process.exitCode = 1;
});
async function main() {
    await store.load();
    await (0, registerCommands_1.registerCommands)({
        token: config.DISCORD_TOKEN,
        clientId: config.DISCORD_CLIENT_ID,
        devGuildId: config.DEV_GUILD_ID,
        mode: config.COMMANDS_MODE,
        cleanup: config.COMMANDS_CLEANUP,
        logger,
    });
    const client = new discord_js_1.Client({
        intents: [discord_js_1.GatewayIntentBits.Guilds, discord_js_1.GatewayIntentBits.GuildMembers, discord_js_1.GatewayIntentBits.DirectMessages],
        partials: [discord_js_1.Partials.Channel],
    });
    const handlers = (0, registry_1.handlerByName)();
    client.on("interactionCreate", async (interaction) => {
        const reqId = `${Date.now()}-${interaction.id ?? Math.random().toString(36).slice(2)}`;
        const scopedLogger = logger.child({
            reqId,
            kind: interaction.isChatInputCommand() ? interaction.commandName : interaction.type,
        });
        try {
            if (interaction.isAutocomplete()) {
                await (0, autocomplete_1.handleAutocomplete)(interaction, store);
                return;
            }
            if (interaction.isButton()) {
                await (0, mayorRequests_1.handleMayorRequestButtons)({ interaction, store, logger: scopedLogger });
                await (0, roleRequests_1.handleRoleRequestButtons)({ interaction, store, logger: scopedLogger });
                await (0, mayorClaim_1.handleMayorClaimButtons)({ interaction, store, logger: scopedLogger });
                await (0, mayorDashboard_1.handleMayorDashboardButtons)({ interaction, store, logger: scopedLogger });
                await (0, guildRoles_1.handleGuildRoleButtons)({ interaction, store });
                return;
            }
            if (interaction.isStringSelectMenu()) {
                await (0, selfAssign_1.handleSelfAssignMenus)(interaction, store);
                await (0, mayorDashboard_1.handleMayorDashboardMenus)({ interaction, store, logger: scopedLogger });
                return;
            }
            if (interaction.isModalSubmit()) {
                await (0, roleRequests_1.handleRoleRequestModal)({ interaction, store, logger: scopedLogger });
                await (0, mayorClaim_1.handleMayorClaimModal)({ interaction, store, logger: scopedLogger });
                await (0, mayorDashboard_1.handleMayorDashboardModal)({ interaction, store, logger: scopedLogger });
                await (0, guildRoles_1.handleGuildRoleModals)({ interaction, store });
                return;
            }
            if (!interaction.isChatInputCommand())
                return;
            const handler = handlers[interaction.commandName];
            if (!handler)
                return;
            await handler({ client, interaction, store, config, logger: scopedLogger });
        }
        catch (err) {
            scopedLogger.error("Interaction handler failed", err);
            if (interaction.isRepliable()) {
                const content = err instanceof Error ? err.message : "Unknown error";
                if (interaction.deferred || interaction.replied) {
                    await interaction.editReply({ content: `Error: ${content}` }).catch(() => null);
                }
                else {
                    await interaction.reply({ content: `Error: ${content}`, flags: v10_1.MessageFlags.Ephemeral }).catch(() => null);
                }
            }
        }
    });
    const stopScheduler = (0, scheduler_1.startScheduler)({ client, store, logger });
    const healthServer = (0, health_1.startHealthServer)(config.HEALTH_PORT ?? 3000, logger.child({ service: "health" }));
    client.once(discord_js_1.Events.ClientReady, async () => {
        logger.info(`Logged in as ${client.user?.tag}`);
        for (const guild of client.guilds.cache.values()) {
            await (0, overview_1.upsertGuildOverview)(guild, store).catch(() => null);
        }
    });
    client.on(discord_js_1.Events.GuildMemberUpdate, async (oldMember, newMember) => {
        try {
            const gs = store.get().guilds[newMember.guild.id];
            if (!gs)
                return;
            const settlementMayorRoleIds = (0, mayorAggregate_1.allSettlementMayorRoleIds)(store, newMember.guild.id);
            if (!settlementMayorRoleIds.length)
                return;
            const relevantChanged = settlementMayorRoleIds.some((rid) => oldMember.roles.cache.has(rid) !== newMember.roles.cache.has(rid));
            if (!relevantChanged)
                return;
            const mayorAggregateRoleId = await (0, mayorAggregate_1.getOrCreateMayorAggregateRoleId)(store, newMember.guild);
            if (!mayorAggregateRoleId)
                return;
            await (0, mayorAggregate_1.syncMayorAggregateForMember)({ member: newMember, mayorAggregateRoleId, settlementMayorRoleIds });
        }
        catch (err) {
            logger.error("GuildMemberUpdate handler failed", err);
        }
    });
    client.on(discord_js_1.Events.MessageCreate, async (message) => {
        try {
            await (0, mayorProof_1.handleMayorProofDmMessage)({ message, store, logger });
        }
        catch (err) {
            logger.error("MessageCreate handler failed", err);
        }
    });
    await client.login(config.DISCORD_TOKEN);
    const shutdown = async () => {
        logger.info("Shutting down...");
        stopScheduler();
        healthServer.close();
        await client.destroy();
        process.exit(0);
    };
    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);
}
void main().catch((err) => {
    logger.error("Bot crashed", err);
    process.exitCode = 1;
});
