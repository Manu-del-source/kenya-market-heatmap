/**
 * Import an official NSE end-of-day statistics file (CSV) into the database.
 *
 *   npm run ingest:eod -- --file=data/ingest/nse-eod-2026-09-19.csv
 *   npm run ingest:eod -- --dir=data/ingest/nse
 *
 * WHY THIS EXISTS
 * ---------------
 * NSE market data is licensed, not open. The legitimate way to get real data
 * into this platform is to obtain the official end-of-day statistics (directly
 * from NSE Data Services or from your licensed vendor) and import them here.
 * This script never fetches anything from the internet — it only reads files
 * you already have the rights to use.
 *
 * COLUMN MAPPING
 * --------------
 * Headers are matched by alias, so most vendor exports work unchanged:
 *   date      : date | trade_date | session | trading_date
 *   ticker    : ticker | symbol | code | security
 *   OHLC      : open/high/low/close | day_high | previous_close ...
 *   volume    : volume | shares_traded | traded_volume
 *   turnover  : turnover | value | value_traded | turnover_kes
 */

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { getRepository } from "../src/lib/db";
import { listCompanies } from "../src/lib/services/market-service";
import { getMarketDataProvider } from "../src/lib/providers";
import type { PriceBar } from "../src/lib/types/market";
import { parseCsvRecords, parseDate, parseNumeric, pickColumn } from "./lib/csv";

type Row = { ticker: string; bar: PriceBar };

function extractRows(csv: string): Row[] {
  const records = parseCsvRecords(csv);
  const rows: Row[] = [];

  for (const record of records) {
    const date = parseDate(
      pickColumn(record, ["date", "trade_date", "session", "trading_date", "session_date"])
    );
    const ticker = pickColumn(record, ["ticker", "symbol", "code", "security"])?.toUpperCase();
    const close = parseNumeric(pickColumn(record, ["close", "closing_price", "last", "price"]));

    if (!date || !ticker) continue;
    if (close === null) continue; // no close ⇒ nothing to display

    rows.push({
      ticker,
      bar: {
        date,
        open: parseNumeric(pickColumn(record, ["open", "opening_price"])),
        high: parseNumeric(pickColumn(record, ["high", "day_high", "highest"])),
        low: parseNumeric(pickColumn(record, ["low", "day_low", "lowest"])),
        close,
        adjustedClose: parseNumeric(
          pickColumn(record, ["adjusted_close", "adj_close", "adjusted"])
        ),
        volume: parseNumeric(
          pickColumn(record, ["volume", "shares_traded", "traded_volume", "volume_traded"])
        ),
        turnover: parseNumeric(
          pickColumn(record, ["turnover", "value", "value_traded", "turnover_kes"])
        ),
      },
    });
  }

  return rows;
}

function arg(name: string): string | null {
  const prefix = `--${name}=`;
  const match = process.argv.find((value) => value.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
}

async function main() {
  const repository = await getRepository();
  const file = arg("file");
  const dir = arg("dir");

  const files: string[] = [];
  if (file) files.push(file);
  if (dir) {
    const entries = await readdir(dir);
    for (const entry of entries) {
      if (entry.toLowerCase().endsWith(".csv")) files.push(join(dir, entry));
    }
  }

  if (files.length === 0) {
    console.error(
      "Usage: npm run ingest:eod -- --file=data/ingest/nse-eod.csv  (or --dir=data/ingest/nse)"
    );
    process.exitCode = 1;
    return;
  }

  // Only import instruments we already know about; unknown tickers are skipped
  // (silently importing them would create unvalidated companies).
  const companies = await listCompanies();
  const known = new Set(companies.map((company) => company.ticker));
  const provider = getMarketDataProvider();

  let written = 0;
  let skipped = 0;
  const grouped = new Map<string, PriceBar[]>();

  for (const path of files) {
    const csv = await readFile(path, "utf8");
    for (const row of extractRows(csv)) {
      if (!known.has(row.ticker)) {
        skipped += 1;
        continue;
      }
      const list = grouped.get(row.ticker) ?? [];
      list.push(row.bar);
      grouped.set(row.ticker, list);
    }
    console.log(`read ${path}`);
  }

  for (const [ticker, bars] of grouped) {
    written += await repository.upsertPriceBars(ticker, bars);
  }

  await repository.recordIngestionRun({
    provider: "manual-import",
    kind: "eod-file",
    status: "success",
    rowsWritten: written,
    message: `${files.length} file(s), ${skipped} unknown ticker row(s) skipped`,
    startedAt: new Date(),
    finishedAt: new Date(),
  });

  console.log(`imported ${written} bars for ${grouped.size} tickers`);
  if (skipped > 0) {
    console.log(
      `skipped ${skipped} rows for tickers not in the company register (add them to src/data/companies.json first)`
    );
  }
  if (!repository.isPersistent) {
    console.log("Warning: no DATABASE_URL — data was written to the in-memory store only.");
  }
  if (provider.dataMode === "demo") {
    console.log(
      "Warning: demo provider is active. Run with MARKET_DATA_PROVIDER=nse for licensed data."
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
