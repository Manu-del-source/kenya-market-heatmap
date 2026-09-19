/**
 * Pull market data from the active provider into the repository.
 *
 *   npm run ingest:market          # companies, quotes, indices, snapshot
 *   npm run ingest:market -- --history        # also backfill 5y of daily bars
 *   npm run ingest:market -- --history --years=2
 *   npm run ingest:market -- --tickers=KCB,SCOM
 *
 * Safe to re-run: every write is an upsert.
 */

import { ingestMarketSnapshot, ingestPriceHistory } from "../src/lib/services/ingestion-service";
import { getMarketDataProvider } from "../src/lib/providers";
import { getRepository } from "../src/lib/db";

function arg(name: string): string | null {
  const prefix = `--${name}=`;
  const match = process.argv.find((value) => value.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
}

async function main() {
  const provider = getMarketDataProvider();
  const repository = await getRepository();
  const history = process.argv.includes("--history");
  const years = Number(arg("years") ?? 5);
  const tickers = arg("tickers")?.split(",").map((t) => t.trim().toUpperCase()).filter(Boolean);

  console.log(`provider : ${provider.name} (${provider.dataMode})`);
  console.log(`store    : ${repository.kind}${repository.isPersistent ? "" : " (not durable)"}`);

  const snapshot = await ingestMarketSnapshot();
  console.log(
    `[market-snapshot] ${snapshot.status} — ${snapshot.rowsWritten} rows` +
      (snapshot.message ? ` — ${snapshot.message}` : "")
  );

  if (history) {
    const result = await ingestPriceHistory({ years, tickers });
    console.log(
      `[price-history] ${result.status} — ${result.rowsWritten} bars` +
        (result.message ? ` — ${result.message}` : "")
    );
  }

  if (!repository.isPersistent) {
    console.log(
      "\nNote: no DATABASE_URL configured, so nothing was persisted beyond this process."
    );
  }

  if (provider.dataMode === "demo") {
    console.log(
      "\nWarning: the demo provider is active. Values written are SAMPLE DATA, not NSE market data."
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
