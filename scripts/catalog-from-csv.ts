import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type Catalog = {
  version: 1;
  zones: { zone: string; settlements: string[] }[];
};

function parseCsv(content: string) {
  // Very small CSV parser: expects `zone,settlement` with optional header.
  const lines = content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));

  const rows = lines.map((l) => l.split(",").map((c) => c.trim()));
  if (!rows.length) return [];

  const first = rows[0].map((c) => c.toLowerCase());
  const hasHeader = first.includes("zone") && (first.includes("settlement") || first.includes("name"));
  const data = hasHeader ? rows.slice(1) : rows;

  return data
    .map((r) => ({ zone: r[0] ?? "", settlement: r[1] ?? "" }))
    .filter((r) => r.zone && r.settlement);
}

async function main() {
  const [inputArg, outputArg] = process.argv.slice(2);
  if (!inputArg) {
    console.error("Usage: tsx scripts/catalog-from-csv.ts <input.csv> [output.json]");
    process.exitCode = 2;
    return;
  }

  const inputPath = path.resolve(inputArg);
  const outputPath = path.resolve(outputArg ?? "data/settlements-catalog.json");

  const csv = await readFile(inputPath, "utf8");
  const entries = parseCsv(csv);

  const byZone = new Map<string, Set<string>>();
  for (const e of entries) {
    const zone = e.zone.trim();
    const settlement = e.settlement.trim();
    if (!zone || !settlement) continue;
    if (!byZone.has(zone)) byZone.set(zone, new Set());
    byZone.get(zone)!.add(settlement);
  }

  const zones = Array.from(byZone.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([zone, settlements]) => ({
      zone,
      settlements: Array.from(settlements).sort((a, b) => a.localeCompare(b)),
    }));

  const catalog: Catalog = { version: 1, zones };
  await writeFile(outputPath, JSON.stringify(catalog, null, 2), "utf8");
  console.log(`Wrote ${zones.length} zones to ${outputPath}`);
}

void main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

