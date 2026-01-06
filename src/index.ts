import "dotenv/config";
import { Client, Events, GatewayIntentBits, Interaction, Partials } from "discord.js";
import { MessageFlags } from "discord-api-types/v10";
import path from "node:path";
import { loadConfig } from "./config";
import { Logger } from "./logger";
import { handleAutocomplete } from "./discord/autocomplete";
import { handlerByName } from "./discord/commands/registry";
import { registerCommands } from "./discord/registerCommands";
import { startScheduler } from "./scheduler/scheduler";
import { StateStore } from "./state/store";
import { handleMayorRequestButtons } from "./discord/buttons/mayorRequests";
import { upsertGuildOverview } from "./discord/overview";
import { handleSelfAssignMenus } from "./discord/menus/selfAssign";
import { handleRoleRequestButtons, handleRoleRequestModal } from "./discord/interactions/roleRequests";
import { allSettlementMayorRoleIds, getOrCreateMayorAggregateRoleId, syncMayorAggregateForMember } from "./discord/mayorAggregate";
import { handleMayorClaimButtons, handleMayorClaimModal } from "./discord/interactions/mayorClaim";
import { handleMayorProofDmMessage } from "./discord/dm/mayorProof";
import { handleMayorDashboardButtons, handleMayorDashboardMenus, handleMayorDashboardModal } from "./discord/interactions/mayorDashboard";

const config = loadConfig(process.env);
const logger = new Logger("info");
const dataDir = path.resolve(config.DATA_DIR ?? "data");
const store = new StateStore(dataDir);

async function main() {
  await store.load();

  await registerCommands({
    token: config.DISCORD_TOKEN,
    clientId: config.DISCORD_CLIENT_ID,
    devGuildId: config.DEV_GUILD_ID,
    mode: config.COMMANDS_MODE,
    cleanup: config.COMMANDS_CLEANUP,
    logger,
  });

  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.DirectMessages],
    partials: [Partials.Channel],
  });

  const handlers = handlerByName();

  client.on("interactionCreate", async (interaction: Interaction) => {
    try {
      if (interaction.isAutocomplete()) {
        await handleAutocomplete(interaction, store);
        return;
      }
      if (interaction.isButton()) {
        await handleMayorRequestButtons({ interaction, store, logger });
        await handleRoleRequestButtons({ interaction, store, logger });
        await handleMayorClaimButtons({ interaction, store, logger });
        await handleMayorDashboardButtons({ interaction, store, logger });
        return;
      }
      if (interaction.isStringSelectMenu()) {
        await handleSelfAssignMenus(interaction, store);
        await handleMayorDashboardMenus({ interaction, store, logger });
        return;
      }
      if (interaction.isModalSubmit()) {
        await handleRoleRequestModal({ interaction, store, logger });
        await handleMayorClaimModal({ interaction, store, logger });
        await handleMayorDashboardModal({ interaction, store, logger });
        return;
      }
      if (!interaction.isChatInputCommand()) return;

      const handler = handlers[interaction.commandName];
      if (!handler) return;
      await handler({ client, interaction, store, config, logger });
    } catch (err) {
      logger.error("Interaction handler failed", err);
      if (interaction.isRepliable()) {
        const content = err instanceof Error ? err.message : "Unknown error";
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply({ content: `Error: ${content}` }).catch(() => null);
        } else {
          await interaction.reply({ content: `Error: ${content}`, flags: MessageFlags.Ephemeral }).catch(() => null);
        }
      }
    }
  });

  client.once(Events.ClientReady, async () => {
    logger.info(`Logged in as ${client.user?.tag}`);
    startScheduler({ client, store, logger });
    for (const guild of client.guilds.cache.values()) {
      await upsertGuildOverview(guild, store).catch(() => null);
    }
  });

  client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
    try {
      const gs = store.get().guilds[newMember.guild.id];
      if (!gs) return;

      const settlementMayorRoleIds = allSettlementMayorRoleIds(store, newMember.guild.id);
      if (!settlementMayorRoleIds.length) return;

      const relevantChanged = settlementMayorRoleIds.some(
        (rid) => oldMember.roles.cache.has(rid) !== newMember.roles.cache.has(rid),
      );
      if (!relevantChanged) return;

      const mayorAggregateRoleId = await getOrCreateMayorAggregateRoleId(store, newMember.guild);
      if (!mayorAggregateRoleId) return;

      await syncMayorAggregateForMember({ member: newMember, mayorAggregateRoleId, settlementMayorRoleIds });
    } catch (err) {
      logger.error("GuildMemberUpdate handler failed", err);
    }
  });

  client.on(Events.MessageCreate, async (message) => {
    try {
      await handleMayorProofDmMessage({ message, store, logger });
    } catch (err) {
      logger.error("MessageCreate handler failed", err);
    }
  });

  await client.login(config.DISCORD_TOKEN);
}

void main().catch((err) => {
  logger.error("Bot crashed", err);
  process.exitCode = 1;
});
