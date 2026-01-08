"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadConfig = loadConfig;
const zod_1 = require("zod");
const CommandsModeSchema = zod_1.z.enum(["global", "guild"]);
const EnvSchema = zod_1.z.object({
    DISCORD_TOKEN: zod_1.z.string().min(1),
    DISCORD_CLIENT_ID: zod_1.z.string().min(1),
    DEV_GUILD_ID: zod_1.z.string().min(1).optional(),
    COMMANDS_MODE: CommandsModeSchema.optional(),
    COMMANDS_CLEANUP: zod_1.z
        .preprocess((v) => {
        if (typeof v === "boolean")
            return v;
        if (typeof v === "string")
            return v.trim().toLowerCase() === "true";
        return false;
    }, zod_1.z.boolean())
        .optional(),
    DATA_DIR: zod_1.z.string().min(1).optional(),
    DEFAULT_TIMEZONE: zod_1.z.string().min(1).optional(),
    LOG_LEVEL: zod_1.z.enum(["debug", "info", "warn", "error"]).optional(),
    HEALTH_PORT: zod_1.z
        .preprocess((v) => (typeof v === "string" ? Number(v) : v), zod_1.z.number().int().positive().max(65535))
        .optional(),
});
function loadConfig(env) {
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
    cfg.LOG_LEVEL ??= "info";
    cfg.HEALTH_PORT ??= 3000;
    return cfg;
}
