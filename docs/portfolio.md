# Portfolio tracking (Phase 12)

The portfolio feature is deliberately narrow: it **values holdings the user says
they own**. It never executes, recommends, or projects anything.

Implementation: `src/lib/types/portfolio.ts` (contract),
`src/lib/analytics/portfolio.ts` (pure maths),
`src/app/api/portfolio/valuation/route.ts` (stateless endpoint),
`src/hooks/usePortfolio.ts` + `src/components/PortfolioBoard.tsx` (browser).

## 1. Where holdings live

Today: **the visitor's browser**, under the `kmi-portfolio` localStorage key —
the same pattern as the watchlist, because there are no accounts yet.

Consequences, all intentional:

- No personal data is sent to the server except a transient list of
  `{ ticker, quantity, averageCost }` used to compute one response.
- Nothing is persisted server-side, so nothing can leak or be lost by us.
- `/portfolio` is `noindex` — its contents are per-visitor.

When accounts arrive, `usePortfolio` and the valuation endpoint are the only two
places that change. `PortfolioHolding` is already the wire format, so a
server-backed portfolio can reuse it verbatim.

## 2. What the model can and cannot express

| Present | Absent, on purpose |
| --- | --- |
| Ticker, quantity, average cost per share | Orders, fills, trade dates |
| Market value, day change, weight | Cash balance, fees, taxes, dividends |
| Cost basis and unrealised P/L (where a basis exists) | Realised P/L, tax lots, wash sales |
| Sector allocation, concentration | Targets, rebalancing suggestions, advice |

There is no field anywhere that could represent a trade. That is the design
constraint, not an oversight: this platform is not a broker and will not emulate
one.

## 3. Valuation rules

`computePortfolioValuation()` is pure — quotes and reference data in, valuation
out. The rules:

1. **Price or nothing.** `marketValue = quantity × price`. No price →
   `marketValue: null`, `weight: null`, the ticker goes in `unpricedTickers`,
   and it is excluded from every total. It is never valued at zero, because
   zero would understate the portfolio.
2. **A missing cost basis is unknown, not free.** Without `averageCost`,
   `costValue`, `unrealised` and `unrealisedPercent` are all `null` (`—`).
3. **Apples to apples.** Cost basis and P/L are summed only over positions that
   have a cost. `costCoverage` reports what share of portfolio market value that
   subset represents, and a note states the coverage percentage whenever it is
   partial.
4. **Merging lots never invents a price.** Two lots of the same ticker merge by
   adding quantities, and the average cost becomes the quantity-weighted mean —
   unless either lot has no cost, in which case the merged holding has
   **no** average cost. Dividing the known cost by the total share count would
   silently price the unknown lot at zero.
5. **Day change uses the source's move.** Per-position day change is
   `quantity × change` where `change` is the quote's absolute change, falling
   back to `price − previousClose`. The portfolio percentage uses the summed
   previous-close value as its base. No change data → `null`.
6. **Weights need a total.** Weights are computed in a second pass once the
   portfolio total is known; unpriced positions have no weight.

## 4. Allocation and concentration

- `bySector` groups priced positions by sector slug and sorts by value.
- `largestPositions` lists the five biggest weights.
- `concentration` reports, neutrally:
  - `largestPositionWeight` / `largestPositionTicker`
  - `hhi` — Herfindahl–Hirschman index of position weights (`0` = perfectly
    spread, `1` = a single holding)
  - `positionsToHalf` — how many positions make up half the value

These are descriptions of what the portfolio *is*. The UI states them and stops;
there is no threshold, warning colour or "consider diversifying" prompt, because
that would be advice.

## 5. Endpoint

```
POST /api/portfolio/valuation
{ "holdings": [ { "ticker": "KCB", "quantity": 1000, "averageCost": 38.5 } ] }
```

Reply: the standard `{ meta, data }` envelope with `data` being a
`PortfolioValuation` (totals, positions, allocation, concentration, notes).

- **Stateless**: no session, no storage, no cookies.
- **Validated**: body capped at 32 KB, at most 60 holdings, tickers must match
  `^[A-Z0-9][A-Z0-9.-]{0,14}$`, quantity must be finite and > 0, average cost
  must be ≥ 0 (or omitted). Failures return `400` with a specific message.
- **Rate-limited** to 30 requests/minute per client — tighter than a market
  read, because each request fans out to quotes.
- `405` for anything other than `POST`.

## 6. What is deliberately not included yet

- **Server-side portfolios.** Needs accounts; the schema is intentionally not
  modelled until identity exists (`portfolios` + `portfolio_holdings` with an
  owner is the obvious shape).
- **Performance against a benchmark.** That is a comparison problem, not a
  portfolio problem: once `/compare` supports a custom series it can be reused.
- **Historical portfolio value over time.** It needs a full price archive per
  holding, which only exists when a licensed feed is connected.
- **CSV import/export.** Export is straightforward (the holding shape is already
  JSON); import needs a mapping UI and validation rules for broker statements,
  which is a phase of its own.
