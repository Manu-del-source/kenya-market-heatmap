# Data model

Physical schema: `drizzle/0000_init.sql` (hand-maintained to match
`src/lib/db/schema.ts`, applied by `npm run db:migrate`).

## Design principles

1. **One fact, one column.** Derived values are computed on read, or stored once
   per snapshot date. A sector return is not duplicated onto every company row.
2. **`NULL` means "not reported".** Never zero, never an estimate. The UI
   renders `null` as an em dash.
3. **Provenance on every table.** `source` and `as_of` columns make any number
   traceable to the run that wrote it.
4. **Market data and economic data never mix.** Different publishers, licences,
   frequencies and semantics.
5. **Upserts everywhere.** Re-running ingestion is safe; there are no
   destructive writes.

## Entity relationship

```
                    ┌──────────┐
                    │ sectors  │
                    └────┬─────┘
                         │ 1
                         │
                         │ n
┌────────────┐      ┌────┴───────┐        ┌────────────┐
│  quotes    │ n─1  │ companies  │ 1─n    │ price_bars │
└────────────┘      └────┬───────┘        └────────────┘
                         │
                         │ n
                   ┌─────┴──────────┐
                   │ sector_snapshots│
                   └────────────────┘

market_indices ──1:n── index_bars

market_snapshots          (one row per trading day)

economic_indicators ──1:n── economic_observations

ingestion_runs            (audit trail, no foreign keys)
```

## Reference data

### `sectors`

NSE market segments. `slug` is used in URLs (`/sectors/banking`).

| Column | Type | Notes |
| --- | --- | --- |
| `id` | serial PK | |
| `slug` | text unique | `banking`, `energy-petroleum`, … |
| `name` | text | Official segment name, e.g. `Energy & Petroleum` |
| `description` | text null | |

### `companies`

Identity and classification **only** — no prices live here. Seeded from
`src/data/companies.json`.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | serial PK | |
| `ticker` | text unique | NSE ticker, e.g. `SCOM` |
| `name` | text | |
| `sector_id` | int FK → sectors | |
| `industry` | text | Finer-grained than the NSE segment |
| `description` | text null | |
| `logo_url` | text null | Reserved; unused until a licensed logo source exists |
| `shares_outstanding` | bigint null | Used to derive market cap when reported |
| `market_cap` | numeric(24,2) null | Latest reported capitalisation in KES |
| `listing_status` | text | `listed` \| `suspended` \| `delisted` |
| `currency` | text | `KES` |
| `country` | text | ISO 3166-1 alpha-2 of the primary listing |
| `cross_listing` | bool | True for e.g. Umeme (UG) and BK Group (RW) |
| `isin` | text null | |

## Market data

### `price_bars`

One row per instrument, per session, per interval.

| Column | Type | Notes |
| --- | --- | --- |
| `company_id` | int FK | |
| `trade_date` | date | Session date |
| `interval` | text | `1d` today; `1h` / `5m` if an intraday feed is licensed |
| `open` / `high` / `low` / `close` | numeric(18,4) null | |
| `adjusted_close` | numeric(18,4) null | Corporate-action adjusted, when supplied |
| `volume` | bigint null | Shares traded |
| `turnover` | numeric(24,2) null | Value traded in KES |
| `source` | text | Provider or `manual-import` |

Unique on `(company_id, trade_date, interval)` — the constraint that makes
ingestion idempotent. Indexed on `trade_date` for range scans.

**Read pattern.** Historical comparison reads many instruments for the same
window, so the repository exposes a batch method alongside the single-ticker
one:

| Method | Query | Used by |
| --- | --- | --- |
| `getPriceBars(ticker, from, to)` | one instrument | `/api/stocks/[ticker]/history`, trailing returns |
| `getPriceBarsForTickers(tickers, from, to)` | `WHERE company_id IN (…) AND trade_date BETWEEN …`, one round-trip | `/compare`, `/api/compare/*` |

Both are part of the `MarketRepository` interface, so the memory store and
Postgres are interchangeable and the batch guarantee ("one query, not N") holds
for whichever is attached.

### `quotes`

A materialised "latest quote" row per company. It duplicates the newest
`price_bars` row on purpose: the dashboard reads every quote on every page view
and that read must stay a single indexed scan.

| Column | Notes |
| --- | --- |
| `company_id` PK | One row per company |
| `session_date` | Session the quote belongs to |
| `price`, `previous_close`, `change_abs`, `change_percent` | `change_percent` in percentage points (2.41 = +2.41%) |
| `day_high`, `day_low` | |
| `volume`, `turnover`, `market_cap` | |
| `as_of` | Timestamp of the underlying observation |
| `source` | |
| `updated_at` | |

### `market_indices` / `index_bars`

Index definitions and one history point per session. `index_bars` exists so
index charts do not have to be reconstructed from quotes.

### `market_snapshots`

One row per trading day — the basis for historical market analysis.

| Column | Notes |
| --- | --- |
| `trade_date` PK | |
| `advancing`, `declining`, `unchanged`, `unpriced` | Breadth counts for the session |
| `total_volume`, `total_turnover`, `total_market_cap` | Nullable: totals are only stored when every contributor reported |
| `market_return` | Capitalisation-weighted return for the session |
| `as_of`, `source` | |

`unpriced` is stored explicitly so the UI can qualify a count
("19 of 42 companies priced") instead of implying full coverage.

### `sector_snapshots`

Per-sector daily aggregates written by ingestion (`sector_id`, `trade_date`,
`companies`, `market_value`, `daily_return`, `weekly_return`, `monthly_return`,
`turnover`, `advancing`, `declining`, `source`). Stored so sector history does
not have to be recomputed from `price_bars`; the read side for sector history
arrives with the sector analytics view.

## Economic data

### `economic_indicators`

Catalogue of series the platform can display. Populated from
`src/data/economic-series.json`.

| Column | Notes |
| --- | --- |
| `series_id` unique | Platform-owned code, e.g. `KE.CBK.CBR` |
| `name`, `category`, `unit`, `frequency` | `monthly` / `quarterly` / `weekly` / `daily` / `event` |
| `description` | |
| `source`, `source_url`, `license` | Publisher attribution and redistribution terms |
| `first_observation`, `last_observation` | Coverage bounds |

### `economic_observations`

| Column | Notes |
| --- | --- |
| `indicator_id` FK | |
| `observation_date` | Period start (month / quarter / day) |
| `value` | double precision, nullable |
| `as_of` | Publication timestamp when known |
| `source` | |

Unique on `(indicator_id, observation_date)`.

## Operational

### `ingestion_runs`

`provider`, `kind`, `started_at`, `finished_at`, `status`
(`running` / `success` / `partial` / `failed`), `rows_written`, `message`.
An audit trail is the only way to answer "when did we last load data, from
where, and did it work?" without reading logs.

## Type mapping (Drizzle ↔ Postgres ↔ TypeScript)

| Domain concept | Postgres | Drizzle | TypeScript |
| --- | --- | --- | --- |
| Price / index level | `numeric(18,4)` | `numeric(name, { precision: 18, scale: 4, mode: "number" })` | `number \| null` |
| Money aggregates | `numeric(24,2)` | same, scale 2 | `number \| null` |
| Shares | `bigint` | `bigint(name, { mode: "number" })` | `number \| null` |
| Percentages | `double precision` | `doublePrecision` | `number \| null` |
| Session dates | `date` | `date` | `string` (`YYYY-MM-DD`) |
| Timestamps | `timestamptz` | `timestamp({ withTimezone: true })` | `Date` in the repository, ISO `string` in the domain types |

Dates are strings in the domain model and in JSON responses: it avoids
timezone drift (everything is Africa/Nairobi) and keeps payloads small.

## Derived, not stored

Some figures are computed on read rather than persisted, because storing them
would make a stale value look authoritative:

- **Trailing returns, drawdown, volatility** — `src/lib/analytics/series.ts`.
- **Breadth counts** — `src/lib/analytics/breadth.ts`.
- **Comparison series and sector index levels** —
  `src/lib/analytics/comparison.ts`. A comparison adds **no tables**: it reads
  `price_bars` in one batch and rebases each series to 100 in memory. The
  equal-weighted sector index is likewise derived per request, which is why its
  constituent coverage travels with every row instead of being implied.

See [comparison.md](comparison.md) for the alignment and gap rules.

## Not modelled yet: portfolios

Phase 12 ships portfolio **valuation** without portfolio **persistence**. There
are no accounts, so the database deliberately has no `portfolios` or
`portfolio_holdings` table — storing financial positions against an anonymous
request would create personal data the platform cannot protect or return to its
owner.

Holdings live in the browser (`kmi-portfolio`) and travel to the server only as
a request body that is validated, valued and discarded. The domain type
`PortfolioHolding` (`src/lib/types/portfolio.ts`) is already the wire format, so
when identity exists the natural shape is:

```
portfolios ──┬─ portfolio_holdings   (ticker, quantity, average_cost, added_at)
             └─ owner                (user id, from the future auth provider)
```

with the same "no invented values" rules the in-browser version follows:
nullable price, nullable cost basis, and coverage reported rather than assumed.
Details: [portfolio.md](portfolio.md).

## Deliberately absent

The following are common in stock dashboards and are **not** modelled, because
the platform has no verified source for them:

- P/E, EPS, book value, dividend yield, payout ratio
- Analyst targets or ratings
- News, filings and corporate announcements
- Intraday order book / Level 2 data
- Broker identifiers and trade-level data

Each of these needs a licensed source and its own provenance story. Adding the
column before the source is how a dashboard starts printing fiction.
