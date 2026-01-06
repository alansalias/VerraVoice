import { z } from "zod";

const CommandsModeSchema = z.enum(["global", "guild"]);

const EnvSchema = z.object({
  DISCORD_TOKEN: z.string().min(1),
  DISCORD_CLIENT_ID: z.string().min(1),
  DEV_GUILD_ID: z.string().min(1).optional(),
  COMMANDS_MODE: CommandsModeSchema.optional(),
  COMMANDS_CLEANUP: z
    .preprocess((v) => {
      if (typeof v === "boolean") return v;
      if (typeof v === "string") return v.trim().toLowerCase() === "true";
      return false;
    }, z.boolean())
    .optional(),
  DATA_DIR: z.string().min(1).optional(),
  DEFAULT_TIMEZONE: z.string().min(1).optional(),
});

export type EnvConfig = z.infer<typeof EnvSchema>;

export function loadConfig(env: NodeJS.ProcessEnv): EnvConfig {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment:\n${issues}`);
  }

  const cfg = parsed.data;
  if (!cfg.COMMANDS_MODE) {
    cfg.COMMANDS_MODE = cfg.DEV_GUILD_ID ? "guild" : "global";
  }
  cfg.COMMANDS_CLEANUP ??= false;

  return cfg;
}
