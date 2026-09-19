# Architecture

Kenya Market Intelligence is a Next.js 16 App Router application organised so
that **data sourcing, storage, analytics and presentation can each change
independently**. This document describes the layers, the read policy and the
reasons behind the main decisions.

## 1. Request flow

```
Browser
  │
  ├─ Server Component page (/ , /stocks , /stocks/[ticker] , /sectors , /economy)
  │     └─ src/lib/services/market-service.ts
  │            ├─ src/lib/providers/*        (external source of truth)
  │            └─ src/lib/db/*               (durable store; optional)
  │
  ├─ Client Components (heatmap filtering, price chart, watchlist board)
  │     └─ fetch /api/*  ──► src/lib/api/route-helpers.ts ──► services
  │
  └─ Route Handlers (/api/**)
        └─ validation → rate limit → service → { meta, data }
```

Nothing in `src/components/**` or `src/app/**` imports a provider or a
repository directly. UI code imports services; services import providers and
repositories. This is what makes the demo→licensed switch a configuration
change rather than a refactor.

## 2. Layers

### `src/lib/providers` — where data comes from

One interface, `MarketDataProvider`, with two implementations:

| Provider | Id | Data mode | Notes |
| --- | --- | --- | --- |
| `DemoMarketDataProvider` | `demo` | `demo` | Deterministic sample series. Reference data (names, sectors, index definitions) is real; prices are synthetic. |
| `NseMarketDataProvider` | `nse` | `live` / `delayed` / `end-of-day` | Talks to a licensed vendor gateway over a documented REST contract. Refuses to construct without credentials. |

A provider declares its own `dataMode`, `attribution`, `capabilities`
(intraday? how many years of history? turnover? reference data?) and
`limitations`. Those declarations flow into every API response and every page,
which is how the UI labels the data honestly without special-casing vendors.

Factory: `getMarketDataProvider()` in `src/lib/providers/index.ts`.

```
MARKET_DATA_PROVIDER=demo → demo, always
MARKET_DATA_PROVIDER=nse  → licensed feed, hard error if unconfigured
unset / auto              → licensed feed when fully configured, else demo
```

There is **no automatic fallback from a failing live feed to demo data**. A
silent fallback is the single most dangerous thing a market-data app can do:
the user sees plausible numbers with no indication they are not real. If the
live provider fails, the API returns `502` and the UI shows
*Data unavailable*.

### `src/lib/db` — where data is kept

```
MarketRepository (interface)
├── MemoryRepository    — process-local, zero config, not durable
└── PostgresRepository  — Drizzle ORM + node-postgres, activated by DATABASE_URL
```

`getRepository()` returns Postgres when `DATABASE_URL` is set, otherwise the
in-memory implementation. The Postgres module is imported dynamically so a
deployment without a database never loads the `pg` driver.

Ingestion is the only writer: `src/lib/services/ingestion-service.ts` pulls from
the active provider and upserts into the repository. Every write is idempotent,
so scheduled runs and manual backfills are both safe to repeat.

### `src/lib/services` — read policy

`market-service.ts` decides, per read, whether to ask the provider or the store:

| Read | Policy | Reason |
| --- | --- | --- |
| Quotes, indices, market summary | Provider, unless the provider is the demo provider **and** the store already holds a snapshot for the session | Ingested real data beats sample data; a live feed beats both |
| Price history | Store when it is durable and has bars; otherwise the provider | Ingestion builds a real archive; the demo provider can synthesise one |
| Company / sector reference data | Store, else provider | Same pattern |
| Economic series | Store only | Never estimated, never synthesised |
| Comparison (`comparison-service.ts`) | Store via one batched `getPriceBarsForTickers` call; provider fallback is per-instrument and concurrent | One query serves the whole comparison |
| Portfolio valuation (`/api/portfolio/valuation`) | Provider/store quotes only — holdings come from the request and are never persisted | No accounts, so no server-side personal data |

All reads are memoised through `src/lib/cache.ts` (TTL from config, with
in-flight de-duplication so a cold lambda does not stampede the provider).

### `src/lib/analytics` — pure maths

`series.ts` (returns, drawdown, volatility, moving averages, rebasing),
`breadth.ts` (advance/decline, sector breadth, coverage caveats) and
`comparison.ts` (cleaning, base-100 normalisation, window alignment,
equal-weighted index construction). No I/O, no React: every function is
unit-tested, and every function returns `null` when it cannot compute a truthful
answer.

`comparison.ts` also defines the alignment strategy identifier
`common-window-independent-base` used across the payload, the API and the UI —
see [comparison.md](comparison.md).

### `src/app/api` — the boundary

`src/lib/api/route-helpers.ts` provides:

- `jsonEnvelope(data, meta, { sMaxAge })` — the `{ meta, data }` shape plus CDN
  cache headers
- `errorResponse(error)` — maps provider/validation errors to status codes and
  prevents internal details from leaking
- `withApi(handler, { limit })` — rate limiting + error normalisation
- `safeCompare(a, b)` — constant-time comparison for the cron secret

## 3. Provenance model

```ts
type MarketDataMeta = {
  provider: string        // "demo" | "nse"
  providerName: string    // "Demo market data (sample)"
  dataMode: DataMode      // live | delayed | end-of-day | demo | unavailable
  asOf: string            // ISO timestamp
  attribution: string     // must be rendered next to any derived figure
  sourceUrl?: string
  limitations: string[]   // e.g. "End-of-day granularity only"
}
```

Every API response and every page renders this. Consequences:

- A page can never display a number without stating where it came from.
- Data-mode badges (`DEMO`, `LIVE`, `DELAYED`, `END OF DAY`,
  `DATA UNAVAILABLE`) are derived from `meta`, not hard-coded per page.
- Cached or archived responses remain self-describing.

## 4. Caching strategy

| Layer | Mechanism | TTL |
| --- | --- | --- |
| Page | Next.js ISR (`export const revalidate`) | 60s (market), 300s (comparison), 600s (economy), 3600s (sitemap) |
| Service | In-process TTL map with in-flight de-duplication | 60s quotes, 900s history |
| HTTP | `Cache-Control: public, s-maxage=…, stale-while-revalidate=…` | matches the endpoint |
| Client | `cache: "no-store"` fetches + explicit refresh controls | user-driven |

The in-process cache is per instance by design. It exists to collapse duplicate
work within a request burst, not to be a distributed cache; a shared cache
(Vercel KV / Redis) is the natural next step if read volume grows.

## 5. Performance decisions

- Server Components by default. Client JS is limited to the heatmap controls,
  the price chart, the comparison workspace, the watchlist board and the
  portfolio board (which must read `localStorage`).
- No charting library: charts are hand-built SVG (~2 KB vs. ~150 KB for a
  charting bundle). The comparison chart draws every series in one inline SVG
  with a shared date axis.
- Batched reads: a five-way comparison issues one history query, not five.
- No CSS framework at runtime: a single hand-written stylesheet with CSS custom
  properties.
- Only three runtime dependencies: `next`, `react`, `react-dom`, plus
  `drizzle-orm` and `pg` (the latter loaded lazily, only when a database is
  configured).
- Paginated list endpoints with a hard `pageSize` cap; history endpoints return
  only the requested range.
- `next.config.ts` marks `pg` as a server-external package so it is never
  bundled for the client.

## 6. Failure behaviour

| Situation | Behaviour |
| --- | --- |
| No licensed feed configured | Demo provider, banner + `DEMO` badges on every figure |
| Licensed feed selected but not configured | `503 ProviderNotConfiguredError`, *Data unavailable* |
| Licensed feed errors or times out | `502`, *Data unavailable* (never demo data) |
| Unknown ticker | `404 UnknownInstrumentError` |
| No history for a range | Empty series + "Data unavailable" in the chart |
| No 52-week reference | `newHighs`/`newLows` are `null`, with an explicit caveat |
| Store has no snapshots | Empty list + note that ingestion has not run |
| Rate limit exceeded | `429` with `Retry-After` and `RateLimit-*` headers |
