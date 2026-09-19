# Market data sourcing

## The short version

**The Nairobi Securities Exchange does not publish a free, open market-data API.**

NSE market data is licensed. Real-time, delayed and end-of-day data is obtained
either directly from **NSE Data Services** or through an **authorised
information vendor**, and the NSE Market Data Policy governs display, derived
data, non-display usage and redistribution separately. Historical data is
purchased through NSE's historical-data request process.

This repository therefore:

- contains **no scraper** and performs **no unauthorised fetching**;
- ships a clearly-labelled **demo provider** for development;
- implements a **licensed-feed provider** that refuses to run without
  credentials;
- supports **manual import of official end-of-day files** the operator has the
  rights to use.

## Sources considered

| Source | Type | Licensing | Verdict |
| --- | --- | --- | --- |
| NSE Data Services (direct) | Live / delayed / EOD feeds, historical reports | Paid licence; separate fees for display, derived data and redistribution | Correct long-term source for a commercial product. Not available for this repository. |
| Authorised information vendors (SIX Financial Information, S&P Global, ICE Consolidated Feed, Synergy Systems / live.mystocks.co.ke) | Redistribute NSE data under their own agreements | Commercial contract required | Viable. `NseMarketDataProvider` is written against a vendor-neutral contract so any of them can be plugged in. |
| Third-party trackers and aggregator sites | Scraped HTML/JSON | Terms generally prohibit scraping and redistribution | **Not used.** Scraping them would violate their terms and produce unlicensed derived data. |
| Academic datasets (e.g. scraped NSE price CSVs on research repositories) | Static historical CSV | Derived from scraped data; unclear licence, often stale | Not suitable as a production source. |

Source: NSE Data Services market-data pages and the NSE Market Data Policy,
reviewed 2026-09-19.

## Provider abstraction

```ts
interface MarketDataProvider {
  readonly id: string
  readonly name: string
  readonly attribution: string
  readonly dataMode: "live" | "delayed" | "end-of-day" | "demo"
  readonly limitations: string[]
  readonly capabilities: {
    intraday: boolean
    historyYears: number
    indices: boolean
    turnover: boolean
    referenceData: boolean
  }

  getCompanies(): Promise<Company[]>
  getCompany(ticker: string): Promise<Company | null>
  getQuotes(tickers?: string[]): Promise<Quote[]>
  getHistoricalPrices(q: { ticker; from; to; interval }): Promise<PriceBar[]>
  getIndices(): Promise<IndexQuote[]>
  getMarketSummary(): Promise<MarketSummary | null>
}
```

`src/lib/providers/index.ts` selects the implementation:

```
MARKET_DATA_PROVIDER=demo          → DemoMarketDataProvider
MARKET_DATA_PROVIDER=nse           → NseMarketDataProvider (error if unconfigured)
unset / auto + credentials present → NseMarketDataProvider
unset / auto + no credentials      → DemoMarketDataProvider
```

A failing licensed feed is **never** silently replaced by demo data.

## Demo provider

`src/lib/providers/demo-provider.ts`

- **Deterministic.** Same ticker + same date ⇒ same series (mulberry32 PRNG
  seeded from the ticker, Box–Muller for normal shocks). Charts do not flicker
  between renders and tests can assert on values.
- **Anchored.** Each series terminates at the sample anchor in
  `src/data/demo-baseline.json`, so the dashboard's headline numbers stay stable.
- **Real reference data, synthetic prices.** Company names, sectors, industries,
  cross-listing flags and index definitions come from
  `src/data/companies.json`, `src/data/sectors.json` and `src/data/indices.json`.
  Prices, volumes and capitalisations do not.
- **End-of-day only.** `capabilities.intraday = false`, so the `1D` chart range
  degrades to recent sessions and says so.
- **Index levels are proxies**, computed as capitalisation-weighted returns over
  the sample quotes (NASI = all companies, NSE20/25/10 = top N by cap,
  BSI = banking sector). They are not official index values.

Regenerating the sample anchors:

```bash
npm run demo:baseline
```

## Licensed feed contract

`NseMarketDataProvider` expects a JSON REST gateway. Authentication is sent as
both `Authorization: Bearer <key>` and `x-api-key: <key>`; requests time out
after `NSE_MARKET_API_TIMEOUT_MS` (default 10s) and are never cached by
`fetch`.

| Method | Path | Query | Response |
| --- | --- | --- | --- |
| `GET` | `/companies` | — | `{ data: Company[] }` or a bare array |
| `GET` | `/quotes` | `symbols=A,B` | `{ data: Quote[] }` |
| `GET` | `/prices/{ticker}` | `from`, `to`, `interval` | `{ data: PriceBar[] }` |
| `GET` | `/indices` | — | `{ data: IndexQuote[] }` |
| `GET` | `/summary` | — | `{ data: MarketSummary }` |

Accepted field aliases (camelCase or snake_case, first match wins):

| Canonical | Aliases |
| --- | --- |
| `ticker` | `ticker`, `symbol`, `code` |
| `name` | `name`, `companyName`, `securityName` |
| `price` | `price`, `last`, `close`, `lastTradedPrice` |
| `previousClose` | `previousClose`, `prevClose`, `previous_close` |
| `changePercent` | `changePercent`, `change_percent`, `pctChange` |
| `dayHigh` / `dayLow` | `dayHigh` / `dayLow`, `high` / `low` |
| `volume` | `volume`, `sharesTraded`, `volume_traded` |
| `turnover` | `turnover`, `value`, `value_traded` |
| `marketCap` | `marketCap`, `market_cap`, `capitalisation` |
| `date` | `date`, `tradeDate`, `session`, `timestamp` |
| `asOf` | `asOf`, `as_of`, `timestamp`, `lastUpdated` |

Normalisation rules applied to every external payload:

- Tickers are uppercased and validated against `^[A-Z0-9][A-Z0-9.-]{0,14}$`;
  anything else is dropped rather than stored.
- Numbers pass through `safeNumber` / `safePositiveNumber`; unusable values
  become `null`.
- `changePercent` is recomputed from `price` and `previousClose` when the feed
  omits it.
- Non-object responses are rejected with `ProviderUpstreamError`.

If your vendor's contract differs, adapt only `src/lib/providers/nse-provider.ts`
— the rest of the application is unaffected.

## Manual end-of-day import (the practical path to real data)

1. Obtain the official NSE end-of-day statistics for the sessions you want
   (from NSE Data Services or your vendor), in CSV/XLSX form, with a licence
   that permits this use.
2. Drop the files in `data/ingest/nse/` (git-ignored by default).
3. Run:

   ```bash
   npm run ingest:eod -- --dir=data/ingest/nse
   ```

Header aliases are listed in `data/ingest/README.md`. Rows for tickers that are
not in `src/data/companies.json` are **skipped**, so a typo in an export cannot
invent a listing — add genuinely new listings to the register first.

## Update frequency and what to expect

| Feed class | Typical cadence | Platform behaviour |
| --- | --- | --- |
| Live | Continuous | Polling enabled during NSE hours (09:00–15:00 EAT); banner shows `LIVE` |
| Delayed (15 min) | ~1 minute | Banner shows `DELAYED` with the vendor attribution |
| End-of-day | Once per session, after close | Banner shows `END OF DAY`; intraday ranges unavailable |
| Demo | N/A | Banner shows `SAMPLE DATA`; auto-refresh disabled because the values cannot change |

## Compliance checklist before going live

- [ ] Signed agreement with NSE Data Services or an authorised vendor
- [ ] Licence covers **display**, **derived data** (our sector returns, breadth
      and volatility figures) and any **non-display** usage
- [ ] Attribution string rendered on every page that shows the data (handled by
      `MarketDataMeta.attribution`)
- [ ] Redistribution terms understood — this platform's API is not a
      redistribution channel unless separately licensed
- [ ] Historical data purchased if more than the licensed backfill window is
      needed
- [ ] `MARKET_DATA_PROVIDER=nse`, credentials stored as Vercel environment
      variables (never in the repository)
- [ ] `/api/health` confirms `effective: "nse"` and no `DEMO` badges remain
