# Historical comparison (Phase 9)

How `/compare`, `/api/compare/stocks` and `/api/compare/sectors` turn raw
price history into an honest side-by-side view.

Implementation: `src/lib/analytics/comparison.ts` (pure maths),
`src/lib/services/comparison-service.ts` (orchestration + caching),
`src/components/ComparisonChart.tsx` and `ComparisonWorkspace.tsx` (UI).

## 1. The questions, and what "an answer" may contain

The feature answers two questions only:

1. *How did these instruments move relative to their own starting point over a
   shared window?*
2. *What were the measured start, end, high, low and return for each of them?*

It does **not** rank, score, rank-by-risk, or recommend. There is no "best
performer" badge anywhere in the UI by design.

## 2. Normalisation: base 100, per series

Each series is divided by its own first observation **inside the aligned
window** and multiplied by 100:

```
value_t = 100 × (close_t / close_first-in-window)
```

Why per series rather than one shared anchor date: if instrument B has no print
on the window's first session, anchoring it there would require inventing a
price. Anchoring on its own first available session keeps every point a real
observation; the cost — slightly different spans — is disclosed via
`alignment.anchorSpreadSessions`.

A non-positive anchor (a zero or negative close, which appears in malformed
provider data) cannot be normalised: the series is reported as unavailable
rather than producing `Infinity` or a misleading flat line.

## 3. Alignment: `common-window-independent-base`

`alignObservations()` implements the strategy the payload advertises by that
identifier:

1. Clean every series independently — sort ascending, drop rows without a
   usable close, de-duplicate dates (last write wins).
2. **Common window** = `[max(first dates), min(last dates)]`. Every series then
   has at least one observation inside it.
3. If the common window is empty (series genuinely do not overlap), fall back
   to the **union window** and set `overlapping: false`, with a note stating
   the chart is not like-for-like.
4. Report `sharedSessions`, `totalSessions`, `coverageRatio` and
   `anchorSpreadSessions` so the UI can quantify how aligned the data really is.

The window actually used is always returned (`alignment.windowStart` /
`windowEnd`) and displayed, rather than the requested period, because the two
differ whenever a series starts late in the period.

## 4. Missing data

| Situation | Behaviour |
| --- | --- |
| A series has no rows in the period | `available: false` + a `reason` string; the table shows `—` |
| A session is missing in the middle | Skipped. The chart breaks the path at the gap; no interpolation |
| A constituent did not trade on a date (sector index) | Excluded from that day's average; the day's `constituents` count is returned |
| One observation only | `returnPercent: null` — one point cannot express a return |
| Start and end are identical | `0` — a measured flat result, which is different from "unknown" |
| High/low contradict the close (malformed bar) | Clamped: the close participates in the high/low, so a bad `high` cannot understate the range |
| One instrument fails to load | The other series are still returned; a provider error never becomes a fabricated series |

## 5. Sector comparison

There is no licensed NSE sector index feed in this repository, so a sector line
is built from the constituents:

```
index_d = mean over constituents c that traded on day d of
          100 × (close_{c,d} / close_{c, first-in-window})
```

- **Equal-weighted**, because share counts suitable for free-float weighting
  are part of the licensed data we do not have.
- **No forward fill**: a constituent that did not trade is simply absent from
  that day's mean, and the number of constituents behind each point is
  returned.
- The payload and the UI both state that this is an in-app analytical proxy,
  not an official index.

## 6. Efficiency

- One `repository.getPriceBarsForTickers(tickers, from, to)` call serves the
  whole comparison — a single SQL query with `IN (...)` on Postgres, not one
  query per instrument. Sector comparison unions the constituents of every
  selected sector into that same single call.
- Results are memoised by `cached()` at `config.cache.historyTtlSeconds`,
  keyed by the normalised selection and period.
- The first comparison is rendered on the server, so the page is complete
  without JavaScript.

## 7. API

```
GET /api/compare/stocks?tickers=KCB,EQTY,SCOM&period=3Y
GET /api/compare/sectors?sectors=banking,insurance&period=1Y
```

Response envelope (`{ meta, data }`):

```json
{
  "meta": { "provider": "demo", "dataMode": "demo", "asOf": "…", "attribution": "…", "limitations": ["…"] },
  "data": {
    "period": "3Y",
    "from": "2023-09-20",
    "to": "2026-09-19",
    "unit": "KES",
    "series": [
      { "key": "KCB", "label": "KCB", "sublabel": "KCB Group Plc", "color": "#eab308",
        "href": "/stocks/KCB", "available": true, "reason": null,
        "anchorDate": "2023-09-20", "observations": 752,
        "points": [{ "date": "2023-09-20", "value": 100 }, "…"] }
    ],
    "summary": [
      { "key": "KCB", "label": "KCB", "name": "KCB Group Plc", "sector": "Banking",
        "sectorSlug": "banking", "constituents": null, "constituentsWithData": null,
        "unit": "KES", "start": 32.5, "end": 41.1, "normalisedStart": 100,
        "normalisedEnd": 126.46, "returnPercent": 26.46, "high": 44.2, "low": 28.9,
        "firstDate": "2023-09-20", "lastDate": "2026-09-18", "observations": 752,
        "expectedObservations": 752, "coverageRatio": 1, "available": true,
        "reason": null, "href": "/stocks/KCB" }
    ],
    "alignment": {
      "strategy": "common-window-independent-base",
      "requestedStart": "2023-09-20", "requestedEnd": "2026-09-19",
      "windowStart": "2023-09-20", "windowEnd": "2026-09-18",
      "overlapping": true, "sharedSessions": 752, "totalSessions": 752,
      "coverageRatio": 1, "anchorSpreadSessions": 0,
      "notes": ["…"]
    },
    "availableCount": 3,
    "requestedCount": 3
  }
}
```

Validation (400): at most 5 tickers / 10 sectors, tickers must match
`^[A-Z0-9][A-Z0-9.-]{0,14}$`, slugs `^[a-z0-9-]{1,48}$`, period must be one of
`1M, 3M, 6M, 1Y, 3Y, 5Y`. Unknown sector slugs are rejected by name.

## 8. What is deliberately not included

- No volume or turnover comparison: volume in the demo dataset is synthetic,
  and comparing synthetic volume as if it were real would violate the "no
  fabricated statistics" rule. Volume columns exist on `price_bars` and can be
  added once a licensed feed supplies them.
- No correlation, beta, Sharpe ratio or any risk-adjusted ranking: those need a
  verified risk-free rate series and a longer, audited history than this
  platform holds today.
- No downloadable CSV of a comparison yet; the API is the export path.
