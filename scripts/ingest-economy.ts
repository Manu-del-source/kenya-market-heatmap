/**
 * Import economic series from operator-supplied CSV files.
 *
 *   npm run ingest:economy                 # reads data/ingest/economy/*.csv
 *   npm run ingest:economy -- --dir=...
 *
 * File naming:  <seriesId>.csv   e.g.  KE.CBK.CBR.csv
 * File format:  date,value
 *               2026-01-08,8.75
 *               2026-02-10,8.75
 *
 * SOURCING RULES (see docs/economy-data.md)
 * -----------------------------------------
 * Only import files you have exported yourself from the publisher (KNBS, CBK,
 * National Treasury) or received under a licence that permits this use. This
 * script performs no network access and no estimation: if a file is missing,
 * the series stays "awaiting ingest" and the UI shows "Data unavailable".
 */

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { getRepository } from "../src/lib/db";
import { catalogueRecords } from "../src/lib/services/economy-service";
import { parseCsvRecords, parseDate, parseNumeric, pickColumn } from "./lib/csv";

function arg(name: string): string | null {
  const prefix = `--${name}=`;
  const match = process.argv.find((value) => value.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
}

async function main() {
  const repository = await getRepository();
  const dir = arg("dir") ?? join(process.cwd(), "data", "ingest", "economy");

  const catalogue = catalogueRecords();
  await repository.upsertEconomicIndicators(catalogue);
  console.log(`catalogue: ${catalogue.length} series registered`);

  let files: string[];
  try {
    files = (await readdir(dir)).filter((file) => file.toLowerCase().endsWith(".csv"));
  } catch {
    console.log(
      `No ingest directory found at ${dir}. Create it and add <seriesId>.csv files (date,value).`
    );
    return;
  }

  const bySeriesId = new Map(catalogue.map((entry) => [entry.seriesId, entry]));
  let total = 0;

  for (const file of files) {
    const seriesId = file.replace(/\.csv$/i, "");
    const definition = bySeriesId.get(seriesId);
    if (!definition) {
      console.log(`skip ${file} — not a known series id`);
      continue;
    }

    const csv = await readFile(join(dir, file), "utf8");
    const observations = parseCsvRecords(csv)
      .map((record) => ({
        date: parseDate(pickColumn(record, ["date", "period", "observation_date"])),
        value: parseNumeric(pickColumn(record, ["value", "observation", "rate"])),
        asOf: null,
      }))
      .filter(
        (row): row is { date: string; value: number | null; asOf: null } => row.date !== null
      )
      .sort((a, b) => a.date.localeCompare(b.date));

    const written = await repository.upsertEconomicObservations(seriesId, observations);
    total += written;
    console.log(`${seriesId}: ${written} observations`);
  }

  console.log(`imported ${total} observations from ${files.length} file(s)`);
  if (!repository.isPersistent) {
    console.log("Warning: no DATABASE_URL — data was written to the in-memory store only.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
