"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadSettlementCatalog = loadSettlementCatalog;
const promises_1 = require("node:fs/promises");
const node_path_1 = __importDefault(require("node:path"));
const builtinCatalog = {
    version: 1,
    zones: [
        {
            zone: "Sandsquall Desert",
            settlements: ["Aithanahr", "Azmaran", "Djinna", "Squall's End", "Sunhaven"],
        },
        {
            zone: "The Jundark",
            settlements: ["Arisalon", "Hecribba", "Mythbreak", "Tangled Post", "Vinebreach", "Wildport"],
        },
        {
            zone: "The Turquoise Sea",
            settlements: ["Brinebarrel", "Korrin", "Seahook", "Shorefoot", "Windansea"],
        },
        {
            zone: "The Anvils",
            settlements: ["Dhurgrum", "Duunhold", "Kal Torhum", "Vexhelm", "Vhalgadim"],
        },
        {
            zone: "Riverlands",
            settlements: ["Halcyon", "Joeva", "Miraleth", "New Aela", "Winstead"],
        },
    ],
};
async function loadSettlementCatalog(dataDir) {
    const filePath = node_path_1.default.join(dataDir, "settlements-catalog.json");
    try {
        const raw = await (0, promises_1.readFile)(filePath, "utf8");
        const parsed = JSON.parse(raw);
        if (typeof parsed === "object" &&
            parsed !== null &&
            // @ts-expect-error runtime check
            parsed.version === 1 &&
            // @ts-expect-error runtime check
            Array.isArray(parsed.zones)) {
            return parsed;
        }
    }
    catch {
        // ignore and fall back
    }
    return builtinCatalog;
}
