import { RESTPostAPIApplicationCommandsJSONBody, SlashCommandBuilder } from "discord.js";
import { handleElection } from "./election";
import { handleMayor } from "./mayor";
import { handleSchedule } from "./schedule";
import { handleSettlement } from "./settlement";
import { handleSetup } from "./setup";
import { CommandHandler } from "./types";
import { handleWar } from "./war";

export type RegisteredCommand = {
  name: string;
  json: RESTPostAPIApplicationCommandsJSONBody;
  handler: CommandHandler;
};

export function allCommands(): RegisteredCommand[] {
  const setup = new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Initialize bot channels/categories for this server")
    .addSubcommand((s) =>
      s
        .setName("init")
        .setDescription("Create bot-managed categories/channels")
        .addBooleanOption((o) =>
          o
            .setName("clean_install")
            .setDescription("DANGER: delete existing channels/roles first (best-effort)")
            .setRequired(false),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("timezone")
        .setDescription("Set this server's timezone for parsing dates (IANA name)")
        .addStringOption((o) => o.setName("timezone").setDescription("e.g. Europe/Oslo").setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName("populate")
        .setDescription("Create all settlement categories/channels from the local catalog file"),
    );

  const settlement = new SlashCommandBuilder()
    .setName("settlement")
    .setDescription("Manage settlements and their status cards")
    .addSubcommand((s) =>
      s
        .setName("add")
        .setDescription("Add a settlement (creates role + channel + status card)")
        .addStringOption((o) => o.setName("name").setDescription("Settlement name").setRequired(true)),
    )
    .addSubcommand((s) => s.setName("list").setDescription("List settlements"))
    .addSubcommand((s) =>
      s
        .setName("set-tier")
        .setDescription("Set settlement tier (0-5)")
        .addStringOption((o) => o.setName("settlement").setDescription("Settlement").setRequired(true).setAutocomplete(true))
        .addIntegerOption((o) => o.setName("tier").setDescription("Tier 0-5").setRequired(true).setMinValue(0).setMaxValue(5)),
    )
    .addSubcommand((s) =>
      s
        .setName("update")
        .setDescription("Update settlement info (mayor/admin)")
        .addStringOption((o) => o.setName("settlement").setDescription("Settlement").setRequired(true).setAutocomplete(true))
        .addStringOption((o) => o.setName("buildings").setDescription("Buildings (free text)").setRequired(false))
        .addStringOption((o) => o.setName("buy_orders").setDescription("Buy orders (free text)").setRequired(false))
        .addStringOption((o) => o.setName("notes").setDescription("Notes (free text)").setRequired(false)),
    )
    .addSubcommand((s) =>
      s
        .setName("info")
        .setDescription("Show settlement info")
        .addStringOption((o) => o.setName("settlement").setDescription("Settlement").setRequired(true).setAutocomplete(true)),
    )
    .addSubcommand((s) =>
      s
        .setName("announce")
        .setDescription("Post an announcement as the settlement mayor")
        .addStringOption((o) => o.setName("settlement").setDescription("Settlement").setRequired(true).setAutocomplete(true))
        .addStringOption((o) => o.setName("message").setDescription("Announcement text").setRequired(true))
        .addBooleanOption((o) =>
          o.setName("ping_citizens").setDescription("Ping the settlement citizen role (default: true)").setRequired(false),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("destroyed")
        .setDescription("Declare settlement destroyed (resets tier + clears mayor)")
        .addStringOption((o) => o.setName("settlement").setDescription("Settlement").setRequired(true).setAutocomplete(true))
        .addStringOption((o) => o.setName("reason").setDescription("Optional reason/details").setRequired(false)),
    );

  const mayor = new SlashCommandBuilder()
    .setName("mayor")
    .setDescription("Mayor verification + assignment")
    .addSubcommand((s) =>
      s
        .setName("claim")
        .setDescription("Request mayor role for a settlement (requires moderator approval)")
        .addStringOption((o) => o.setName("settlement").setDescription("Settlement").setRequired(true).setAutocomplete(true))
        .addAttachmentOption((o) => o.setName("proof").setDescription("Screenshot proof (image)").setRequired(true))
        .addStringOption((o) => o.setName("guild_name").setDescription("Your in-game guild name").setRequired(true))
        .addStringOption((o) => o.setName("note").setDescription("Short note for moderators").setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName("approve")
        .setDescription("Approve a mayor claim request (admin/mod)")
        .addStringOption((o) => o.setName("request_id").setDescription("Request id").setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName("deny")
        .setDescription("Deny a mayor claim request (admin/mod)")
        .addStringOption((o) => o.setName("request_id").setDescription("Request id").setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName("assign")
        .setDescription("Set the mayor directly (admin/mod)")
        .addStringOption((o) => o.setName("settlement").setDescription("Settlement").setRequired(true).setAutocomplete(true))
        .addUserOption((o) => o.setName("user").setDescription("Mayor user").setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName("clear")
        .setDescription("Clear mayor (admin/mod)")
        .addStringOption((o) => o.setName("settlement").setDescription("Settlement").setRequired(true).setAutocomplete(true)),
    );

  const election = new SlashCommandBuilder()
    .setName("election")
    .setDescription("Election schedule + reminders")
    .addSubcommand((s) =>
      s
        .setName("set")
        .setDescription("Set election schedule for a settlement (creates reminders)")
        .addStringOption((o) => o.setName("settlement").setDescription("Settlement").setRequired(true).setAutocomplete(true))
        .addStringOption((o) => o.setName("registration_start").setDescription("e.g. 2026-01-27 12:00").setRequired(true))
        .addStringOption((o) => o.setName("voting_start").setDescription("e.g. 2026-02-01 00:00").setRequired(true))
        .addStringOption((o) => o.setName("voting_end").setDescription("e.g. 2026-02-05 23:59").setRequired(true))
        .addChannelOption((o) =>
          o.setName("announce_channel").setDescription("Where reminders go (defaults to bot announcements channel)"),
        )
        .addRoleOption((o) => o.setName("mention_role").setDescription("Role to ping for reminders (optional)")),
    )
    .addSubcommand((s) =>
      s
        .setName("clear")
        .setDescription("Clear election schedule + reminders")
        .addStringOption((o) => o.setName("settlement").setDescription("Settlement").setRequired(true).setAutocomplete(true)),
    )
    .addSubcommand((s) =>
      s
        .setName("trigger-ue")
        .setDescription("Trigger an unscheduled election (clears mayor, 24h reg + 24h voting)")
        .addStringOption((o) => o.setName("settlement").setDescription("Settlement").setRequired(true).setAutocomplete(true))
        .addStringOption((o) => o.setName("reason").setDescription("Optional reason/details").setRequired(false))
        .addChannelOption((o) =>
          o.setName("announce_channel").setDescription("Where reminders go (defaults to bot announcements channel)"),
        )
        .addRoleOption((o) => o.setName("mention_role").setDescription("Role to ping for reminders (optional)")),
    );

  const war = new SlashCommandBuilder()
    .setName("war")
    .setDescription("Declare settlement wars (scheduled reminders)")
    .addSubcommand((s) =>
      s
        .setName("declare")
        .setDescription("Declare an upcoming settlement war (creates reminders)")
        .addStringOption((o) => o.setName("attacker").setDescription("Attacking settlement").setRequired(true).setAutocomplete(true))
        .addStringOption((o) => o.setName("defender").setDescription("Defending settlement").setRequired(true).setAutocomplete(true))
        .addStringOption((o) => o.setName("starts_at").setDescription("e.g. 2026-02-10 20:00").setRequired(true))
        .addStringOption((o) => o.setName("title").setDescription("Short title").setRequired(true))
        .addStringOption((o) =>
          o
            .setName("kind")
            .setDescription("War type")
            .setRequired(false)
            .addChoices({ name: "War", value: "war" }, { name: "Siege", value: "siege" }),
        )
        .addStringOption((o) => o.setName("description").setDescription("Optional details").setRequired(false))
        .addChannelOption((o) =>
          o.setName("announce_channel").setDescription("Where reminders go (defaults to bot announcements channel)"),
        )
        .addRoleOption((o) => o.setName("mention_role").setDescription("Role to ping (optional)")),
    );

  const schedule = new SlashCommandBuilder()
    .setName("schedule")
    .setDescription("Create generic scheduled reminders")
    .addSubcommand((s) =>
      s
        .setName("create")
        .setDescription("Create a scheduled reminder")
        .addStringOption((o) => o.setName("title").setDescription("Title").setRequired(true))
        .addStringOption((o) => o.setName("when").setDescription("e.g. 2026-02-10 20:00").setRequired(true))
        .addStringOption((o) =>
          o.setName("reminders").setDescription("Comma-separated minutes before (default: 1440,60,15,0)").setRequired(false),
        )
        .addChannelOption((o) => o.setName("announce_channel").setDescription("Channel to post reminders in"))
        .addRoleOption((o) => o.setName("mention_role").setDescription("Role to ping (optional)"))
        .addStringOption((o) =>
          o
            .setName("settlement")
            .setDescription("Associate with a settlement (optional)")
            .setRequired(false)
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((s) => s.setName("list").setDescription("List upcoming reminders"))
    .addSubcommand((s) =>
      s
        .setName("cancel")
        .setDescription("Cancel a scheduled reminder")
        .addStringOption((o) => o.setName("id").setDescription("Schedule id").setRequired(true)),
    );

  return [
    { name: "setup", json: setup.toJSON(), handler: handleSetup },
    { name: "settlement", json: settlement.toJSON(), handler: handleSettlement },
    { name: "mayor", json: mayor.toJSON(), handler: handleMayor },
    { name: "election", json: election.toJSON(), handler: handleElection },
    { name: "war", json: war.toJSON(), handler: handleWar },
    { name: "schedule", json: schedule.toJSON(), handler: handleSchedule },
  ];
}

export function commandsJson(): RESTPostAPIApplicationCommandsJSONBody[] {
  return allCommands().map((c) => c.json);
}

export function handlerByName(): Record<string, CommandHandler> {
  const map: Record<string, CommandHandler> = {};
  for (const cmd of allCommands()) map[cmd.name] = cmd.handler;
  return map;
}
