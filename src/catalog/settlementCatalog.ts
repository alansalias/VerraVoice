import { readFile } from "node:fs/promises";
import path from "node:path";

export type ZoneCatalog = {
  zone: string;
  settlements: string[];
};

export type SettlementCatalog = {
  version: 1;
  zones: ZoneCatalog[];
};

const builtinCatalog: SettlementCatalog = {
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

export async function loadSettlementCatalog(dataDir: string): Promise<SettlementCatalog> {
  const filePath = path.join(dataDir, "settlements-catalog.json");
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      // @ts-expect-error runtime check
      parsed.version === 1 &&
      // @ts-expect-error runtime check
      Array.isArray(parsed.zones)
    ) {
      return parsed as SettlementCatalog;
    }
  } catch {
    // ignore and fall back
  }
  return builtinCatalog;
}
