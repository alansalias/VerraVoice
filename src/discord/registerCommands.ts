import { Routes } from "discord-api-types/v10";
import { REST } from "discord.js";
import { Logger } from "../logger";
import { commandsJson } from "./commands/registry";

export async function registerCommands(opts: {
  token: string;
  clientId: string;
  devGuildId?: string;
  mode?: "global" | "guild";
  cleanup?: boolean;
  logger: Logger;
}) {
  const rest = new REST({ version: "10" }).setToken(opts.token);
  const body = commandsJson();

  const mode = opts.mode ?? (opts.devGuildId ? "guild" : "global");
  const cleanup = opts.cleanup ?? false;

  if (mode === "guild") {
    if (!opts.devGuildId) {
      throw new Error("COMMANDS_MODE=guild requires DEV_GUILD_ID.");
    }
    opts.logger.info(`Registering guild commands for ${opts.devGuildId}...`);
    await rest.put(Routes.applicationGuildCommands(opts.clientId, opts.devGuildId), { body });

    if (cleanup) {
      opts.logger.info("Cleaning up global commands to avoid duplicates...");
      await rest.put(Routes.applicationCommands(opts.clientId), { body: [] });
    }
    return;
  }

  opts.logger.info("Registering global commands (may take up to 1h to appear)...");
  await rest.put(Routes.applicationCommands(opts.clientId), { body });

  if (cleanup && opts.devGuildId) {
    opts.logger.info(`Cleaning up guild commands for ${opts.devGuildId} to avoid duplicates...`);
    await rest.put(Routes.applicationGuildCommands(opts.clientId, opts.devGuildId), { body: [] });
  }
}
