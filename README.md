# Kenya Market Intelligence

A market-intelligence platform for the **Nairobi Securities Exchange (NSE)** —
market heatmap, listed-company data, historical price analytics, sector
intelligence, market breadth and (progressively) Kenyan economic indicators.

Live: <https://kenya-market-heatmap.vercel.app>

> **Read this before using any number from this project.**
> The public deployment runs on the **demo provider**: prices, volumes and
> capitalisations are *synthetic sample data* generated for development. They
> are labelled `DEMO` / `SAMPLE DATA` everywhere they appear and must never be
> treated as NSE market data or used for an investment decision. See
> [docs/market-data.md](docs/market-data.md) for how to connect a licensed feed.

---

## Contents

- [What this project is](#what-this-project-is)
- [Architecture](#architecture)
- [Data model](#data-model)
- [Historical comparison](#historical-comparison)
- [Portfolio tracking](#portfolio-tracking)
- [Market data providers](#market-data-providers)
- [Local development](#local-development)
- [Environment variables](#environment-variables)
- [Database setup](#database-setup)
- [Ingestion](#ingestion)
- [API](#api)
- [Testing, linting and type checking](#testing-linting-and-type-checking)
- [Deployment](#deployment)
- [Security](#security)
- [SEO](#seo)
- [Limitations](#limitations)
- [Roadmap](#roadmap)

---

## What this project is

An analytical tool for NSE-listed equities and Kenyan macroeconomic data. It is
**not** a brokerage, **not** a trading platform and **not** investment advice.

Design rules that shape every part of the codebase:

1. **Missing is not zero.** Any figure the data source does not report is `null`
   and renders as `—`, never `0` or an estimate.
2. **Provenance travels with the data.** Every API response and page carries the
   provider, the data mode (`live` / `delayed` / `end-of-day` / `demo`), the
   as-of time and the attribution string.
3. **Providers are pluggable.** Nothing outside `src/lib/providers` knows where
   market data comes from.
4. **Sample data is never a silent fallback.** If a live feed is configured but
   unhealthy, the API returns an error and the UI shows *Data unavailable* — it
   does not quietly switch to demo values.
5. **No fabricated fundamentals.** P/E, EPS, dividend yield and similar metrics
   are absent until a source supplies them.

---

## Architecture

```
Browser (React Server Components + a small amount of client JS)
   │
   ├── Server Components ──► src/lib/services/*  (market, economy, ingestion)
   │                              │
   │                              ├── src/lib/providers/*  (demo | licensed NSE feed)
   │                              ├── src/lib/db/*         (repository: Postgres | memory)
   │                              └── src/lib/analytics/*  (returns, breadth, volatility)
   │
   └── Route Handlers ────► /api/market, /api/stocks, /api/stocks/[ticker]/history,
                            /api/sectors, /api/indices, /api/market/breadth,
                            /api/economy, /api/health, /api/cron/ingest
```

Layer responsibilities:

| Layer | Path | Responsibility |
| --- | --- | --- |
| UI | `src/app/**`, `src/components/**` | Rendering. Server Components by default; client components only for filtering, charts and the watchlist. |
| API | `src/app/api/**` | Validation, rate limiting, caching headers, envelope (`{ meta, data }`). |
| Services | `src/lib/services/**` | Read policy (provider vs. store), aggregation, TTL caching. |
| Providers | `src/lib/providers/**` | Talk to an external source. Return domain types + their own limitations. Never imported by UI code. |
| Repository | `src/lib/db/**` | Persistence. `MarketRepository` interface with Postgres and in-memory implementations. |
| Analytics | `src/lib/analytics/**` | Pure functions: returns, drawdown, volatility, breadth. |

Full detail: [docs/architecture.md](docs/architecture.md).

### Routes

| Route | Rendering | Notes |
| --- | --- | --- |
| `/` | ISR (60s) | Market heatmap + overview, breadth, movers, sectors, indices |
| `/stocks` | ISR (60s) | Full company list, search / sector filter / sort / pagination via URL params |
| `/stocks/[ticker]` | ISR (60s) | Company profile, session stats, trailing returns, chart, sector peers |
| `/sectors` | ISR (60s) | Sector aggregates |
| `/sectors/[slug]` | ISR (60s) | Sector drill-down: aggregate + constituents |
| `/compare` | Dynamic (5m cache) | Normalised stock-vs-stock and sector-vs-sector comparison |
| `/economy` | ISR (10m) | Kenyan economic series (populated by ingestion) |
| `/watchlist` | Static shell | Browser-local watchlist (no account required) |
| `/portfolio` | Client board (noindex) | Browser-local holdings, valued server-side |

---

## Data model

Nine tables, split into three independent trees — reference data, market data and
economic data — so a licensing or sourcing change in one area cannot corrupt
another.

```
sectors ──┬─ companies ──┬─ price_bars        (OHLCV, one row per session)
          │              └─ quotes            (materialised latest quote)
          └─ sector_snapshots                 (per-sector daily aggregates)

market_indices ── index_bars
market_snapshots                              (daily whole-market summary)

economic_indicators ── economic_observations  (kept separate from market data)

ingestion_runs                                (audit trail)
```

Drizzle schema: `src/lib/db/schema.ts`. Migration: `drizzle/0000_init.sql`.
Rationale and field-by-field notes: [docs/data-model.md](docs/data-model.md).

---

## Historical comparison

`/compare` answers "how did these instruments behave against each other?" using
only data the platform holds. Periods: `1M`, `3M`, `6M`, `1Y`, `3Y`, `5Y`. Up to
five companies or ten sectors per comparison.

Rules the engine follows ([docs/comparison.md](docs/comparison.md)):

| Rule | Behaviour |
| --- | --- |
| Normalisation | Every series is rebased to **100 at its own first observation** in the aligned window, so lines compare relative performance, not price levels |
| Alignment | The **common window** is used (latest first session → earliest last session) so no series is credited with a move before it had data |
| Missing sessions | Skipped, never interpolated or forward-filled; the chart breaks the line at a gap |
| Unmeasurable values | `null`, rendered `—`. A single observation has no return; `0.00%` is only ever a genuinely measured flat result |
| Sector levels | Equal-weighted index of the constituents that traded each session — a transparent proxy, labelled as such |
| Disjoint series | Fall back to the union window and state that the chart is not like-for-like |

Reads are batched: one `getPriceBarsForTickers` call (a single `IN (...)` query)
serves every instrument in the comparison, so a fifth series adds no fifth
query. Results are cached at `historyTtlSeconds`.

The comparison is analytical only — it is not investment advice, a
recommendation, or a forecast.

---

## Portfolio tracking

`/portfolio` lets a visitor record the NSE shares they already hold and see them
valued at the latest price the platform can verify, with sector allocation and
concentration figures.

- **Holdings stay in the browser.** There are no accounts yet, so nothing
  personal is stored server-side: `usePortfolio` keeps them in `localStorage`
  and the page POSTs them to `/api/portfolio/valuation` purely to be valued.
- **No trading.** There is no order entry, brokerage link, cash balance or fee
  model. Nothing in the data model can express a trade.
- **No invented numbers.** A holding with no verifiable price is listed as
  unpriced and excluded from every total. Without an entered average cost,
  unrealised P/L shows `—`, never `0.00`. Cost basis and P/L are summed only
  over positions that have one, and `costCoverage` states what share of the
  portfolio that represents.
- **Descriptive, not prescriptive.** Concentration (largest weight, HHI,
  positions-to-half) is reported as a fact about the allocation. The platform
  never suggests a target weight or an action.

Input is validated like any untrusted payload: size-capped body, ticker grammar,
positive quantities, non-negative costs, and a tighter rate limit than a market
read.

---

## Market data providers

All market reads go through one interface (`src/lib/providers/types.ts`):

```ts
interface MarketDataProvider {
  getCompanies(): Promise<Company[]>
  getCompany(ticker: string): Promise<Company | null>
  getQuotes(tickers?: string[]): Promise<Quote[]>
  getHistoricalPrices(query: { ticker, from, to, interval }): Promise<PriceBar[]>
  getIndices(): Promise<IndexQuote[]>
  getMarketSummary(): Promise<MarketSummary | null>
}
```

| Provider | `MARKET_DATA_PROVIDER` | Data mode | Status |
| --- | --- | --- | --- |
| `DemoMarketDataProvider` | `demo` (or unset with no feed configured) | `demo` | Complete. Deterministic sample series for development. |
| `NseMarketDataProvider` | `nse` | `live` / `delayed` / `end-of-day` | Implemented against a documented vendor contract; requires a licence and credentials. |

**NSE market data is licensed, not open.** There is no free public NSE API. Real
data arrives either from NSE Data Services or from an authorised information
vendor (SIX Financial Information, S&P Global, ICE, Synergy Systems and others),
and display, derived data and redistribution are each governed by the NSE Market
Data Policy. This repository contains **no scraper** and never fetches data from
a source it does not hold a licence for.

The migration path is:

1. Obtain a licence / vendor contract.
2. Set `NSE_MARKET_API_BASE_URL`, `NSE_MARKET_API_KEY`, `NSE_MARKET_API_VENDOR`.
3. Set `MARKET_DATA_PROVIDER=nse` (or leave `auto`, which prefers the licensed
   feed when it is fully configured).
4. Point the vendor gateway at the REST contract in
   [docs/market-data.md](docs/market-data.md) — no application code changes.

Until then the app runs entirely on labelled sample data.

---

## Local development

```bash
git clone https://github.com/Manu-del-source/kenya-market-heatmap.git
cd kenya-market-heatmap
npm install
cp .env.example .env.local     # optional; defaults work out of the box
npm run dev                    # http://localhost:3000
```

No database and no API keys are required to run the app locally — it boots on
the in-memory store and the demo provider.

Useful commands:

```bash
npm run dev           # dev server
npm run build         # production build
npm run start         # serve the production build
npm run lint          # eslint
npm run typecheck     # tsc --noEmit
npm test              # unit tests (node:test via tsx)
```

---

## Environment variables

All variables are documented in [`.env.example`](.env.example). The ones that
change behaviour:

| Variable | Default | Purpose |
| --- | --- | --- |
| `MARKET_DATA_PROVIDER` | `auto` | `auto` \| `demo` \| `nse` |
| `NSE_MARKET_API_BASE_URL` | — | Licensed feed base URL (required for `nse`) |
| `NSE_MARKET_API_KEY` | — | Licensed feed credential (server-side only, never sent to the browser) |
| `NSE_MARKET_API_VENDOR` | — | Vendor name used for attribution |
| `NSE_MARKET_API_FEED` | `delayed-15m` | `live` \| `delayed-15m` \| `end-of-day` |
| `DATABASE_URL` | — | Postgres connection string; without it the in-memory store is used |
| `DATABASE_SSL` | `false` | Force TLS on the Postgres connection |
| `MARKET_DATA_CACHE_TTL_SECONDS` | `60` | TTL for quotes / overview reads |
| `MARKET_HISTORY_CACHE_TTL_SECONDS` | `900` | TTL for historical series |
| `API_RATE_LIMIT_PER_MINUTE` | `120` | Per-IP limit for API routes |
| `CRON_SECRET` | — | Shared secret for `POST /api/cron/ingest` |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` | Canonical origin for SEO |

Only `NEXT_PUBLIC_*` variables reach the browser. Everything else is read in
`src/lib/config.ts`, which is server-only.

---

## Database setup

```bash
# 1. Provision Postgres (Neon, Supabase, Railway, local…)
export DATABASE_URL="postgres://user:password@host:5432/kenya_market"

# 2. Apply migrations (idempotent, tracked in drizzle_migrations)
npm run db:migrate

# 3. Load reference data + quotes + indices + 5 years of history
npm run db:seed
```

Without `DATABASE_URL` the app uses the in-memory repository: it starts empty,
nothing persists across restarts, and `/api/health` reports
`store.persistent: false`. Historical analytics still work because the demo
provider can generate series; with a licensed *end-of-day* provider you need the
database for any history at all.

---

## Ingestion

| Command | What it does |
| --- | --- |
| `npm run ingest:market` | Companies, quotes, indices and the daily market snapshot from the active provider |
| `npm run ingest:history -- --years=5` | Backfill daily price bars |
| `npm run ingest:eod -- --file=data/ingest/nse/nse-eod-2026-09-18.csv` | Import an **official NSE end-of-day statistics file you hold the rights to** |
| `npm run ingest:economy` | Import `data/ingest/economy/<seriesId>.csv` files (KNBS / CBK exports) |

Every write is an upsert, so re-running is safe. Each run is recorded in
`ingestion_runs`.

Scheduled ingestion: `vercel.json` defines a cron that calls
`/api/cron/ingest?mode=snapshot` at 15:30 EAT on trading days. Set `CRON_SECRET`
— Vercel sends it as `Authorization: Bearer $CRON_SECRET`, and the endpoint
refuses to run when the secret is unset.

---

## API

All endpoints return `{ meta, data }` where `meta` describes the provider, the
data mode, the as-of time, the attribution and any limitations.

| Endpoint | Description |
| --- | --- |
| `GET /api/market` | Summary + indices + breadth + sectors + top movers (one call feeds the homepage) |
| `GET /api/market/breadth?sector=<slug>` | Advance/decline counts, A/D ratio, 52-week highs and lows |
| `GET /api/market/snapshots?limit=90` | Historical daily snapshots (empty until ingestion runs) |
| `GET /api/indices` | Index levels |
| `GET /api/stocks?sector=&q=&sort=&page=&pageSize=&symbols=` | Paginated company list |
| `GET /api/stocks/[ticker]` | Company profile, quote, trailing returns, peers |
| `GET /api/stocks/[ticker]/history?range=1D\|1W\|1M\|3M\|6M\|1Y\|5Y` | OHLCV series + drawdown / volatility stats |
| `GET /api/sectors`, `GET /api/sectors/[slug]` | Sector aggregates and drill-down |
| `GET /api/compare/stocks?tickers=KCB,EQTY&period=3Y` | Normalised multi-ticker comparison (max 5) |
| `GET /api/compare/sectors?sectors=banking,insurance&period=1Y` | Normalised sector comparison (max 10) |
| `GET /api/economy?series=KE.CBK.CBR` | Economic series catalogue and observations |
| `POST /api/portfolio/valuation` | Stateless valuation of client-held holdings (tracking only) |
| `GET /api/health` | Active provider, store kind, whether credentials are present |
| `POST /api/cron/ingest` | Scheduled ingestion (requires `CRON_SECRET`) |

Errors: `400` invalid input, `404` unknown instrument, `429` rate limited,
`502` upstream provider failure, `503` provider not configured.

---

## Testing, linting and type checking

```bash
npm test         # 94 unit tests
npm run lint     # eslint (next/core-web-vitals + typescript)
npm run typecheck
npm run build
```

Tests cover the parts where a wrong number matters most: return and drawdown
maths, breadth counting (especially the "no 52-week reference" case), input
validation, provider determinism, trading-calendar logic, formatting, caching,
rate limiting and the in-memory repository.

Comparison has its own suite ([tests/comparison.test.ts](tests/comparison.test.ts))
pinning the rules that matter: no imputation of missing sessions, no silent
zero for an unmeasurable return, the common-window alignment strategy, and the
disjoint-series fallback.

---

## Deployment

Deployed on **Vercel** from this repository.

- Build: `npm run build` (Next.js 16, Turbopack)
- No server configuration required; the app is stateless when no database is set
- Cron: defined in `vercel.json`
- Environment variables are set in the Vercel project settings; none of the
  market-data credentials are exposed to the browser

Post-deploy checklist:

1. `GET /api/health` — confirm the expected provider and store.
2. `GET /` — confirm the data banner states the active mode.
3. If a licensed feed is configured, confirm the banner shows the vendor
   attribution and that no `DEMO` badges remain.

---

## Security

- Provider credentials are read server-side only (`src/lib/config.ts`) and are
  never serialised into a client component; `/api/health` reports whether a key
  is *present*, never its value.
- All query parameters pass through `src/lib/validation.ts`. Unknown enum values
  are rejected rather than coerced, and page sizes are capped.
- Route Handlers are wrapped in `withApi`, which applies a per-IP fixed-window
  rate limit and normalises errors (server errors are logged, not returned).
- External provider payloads are sanitised through `safeNumber` /
  `safePositiveNumber` before they reach the domain model.
- `next.config.ts` sets CSP (including `connect-src 'self'`, so browser code
  cannot call an external API directly), `X-Content-Type-Options`,
  `Referrer-Policy`, `X-Frame-Options` and `Permissions-Policy`.
- `POST /api/cron/ingest` requires `CRON_SECRET` and is disabled entirely when
  the secret is unset.
- For production, front the public API with Vercel Firewall or a shared
  rate-limit store: the in-process limiter protects a single instance only.

---

## SEO

- Per-route metadata (title, description, canonical, Open Graph, Twitter) via
  `src/lib/seo.ts`.
- `sitemap.xml` generated from the company register, so new listings become
  discoverable automatically; `robots.txt` excludes `/api/` and the
  browser-only `/watchlist`.
- JSON-LD (`Corporation`) on company pages — deliberately without price data, so
  a delayed or sample quote is never presented to crawlers as a definitive
  price.

---

## Limitations

- **The public site shows sample data.** No licensed NSE feed is connected in
  this repository.
- Company reference data is a curated subset (~42 of the 60+ NSE securities) and
  is not independently audited; corrections against the official NSE register
  are welcome.
- The demo provider has **no intraday data**: the `1D` chart range falls back to
  recent end-of-day closes and says so.
- Weekly and monthly sector returns are only computed for periods the stored
  history actually covers; shorter histories return `—`.
- Economic indicators are empty until an operator ingests publisher files.
- The in-memory store does not survive a restart.
- Index levels shown in demo mode are proxies derived from the sample quotes,
  not official index values.
- The in-process rate limiter and cache are per-instance.
- Sector comparison levels are an **equal-weighted in-app proxy**, not an
  official NSE sector index; constituent coverage is shown with every row.
- Portfolios are **browser-local only**: clearing site data erases them, and
  they cannot be recovered or synced until accounts exist.
- Portfolio figures exclude any holding the current source cannot price; they
  are a valuation aid, not a statement of account.

---

## Roadmap

Phases 1–12 of the platform plan are in place. Remaining work:

~~- **Phase 9 — Historical analytics**~~ — shipped. See
  [Historical comparison](#historical-comparison).
~~- **Phase 12 — Portfolios**~~ — shipped (tracking only). See
  [Portfolio tracking](#portfolio-tracking). Moving portfolios server-side needs
  accounts; the holding shape is already the API contract.
- **Phase 10 — Economic intelligence**: the model, catalogue and ingestion
  pipeline exist; the next step is loading real KNBS/CBK series and adding
  charts.
- **Phase 12 — Portfolios**: valuation, allocation and sector exposure from
  user-entered holdings (tracking only, never brokerage).
- **Phase 13 — Alerts**: rule model (`KCB > KSh X`, `sector move > 3%`); no
  notifications until a delivery channel exists.
- **Phase 14 — AI market summaries**: summarise only verified application data,
  with explicit separation of verified data, source-reported information and
  AI-generated text.
- Scheduled intraday ingestion once a live feed is licensed.
- Optional authentication to move watchlists and portfolios server-side.
