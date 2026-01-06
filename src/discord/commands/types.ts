import { ChatInputCommandInteraction, Client } from "discord.js";
import { EnvConfig } from "../../config";
import { Logger } from "../../logger";
import { StateStore } from "../../state/store";

export type CommandHandler = (ctx: {
  client: Client;
  interaction: ChatInputCommandInteraction;
  store: StateStore;
  config: EnvConfig;
  logger: Logger;
}) => Promise<void>;

