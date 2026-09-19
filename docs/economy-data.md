# Economic data

Economic indicators are kept in a **separate tree** from market data: different
publishers, different licences, different release calendars, different
semantics. A monthly CPI print is not a daily close, and the two must never be
modelled as if they were interchangeable.

## Publishers

| Publisher | Series | Publication |
| --- | --- | --- |
| Kenya National Bureau of Statistics (KNBS) | CPI / inflation, quarterly national accounts (GDP), trade statistics, leading economic indicators | Monthly / quarterly releases and PDF or Excel tables |
| Central Bank of Kenya (CBK) | Central Bank Rate, Treasury bill yields, interbank and KESONIA, interbank FX rates, commercial bank weighted average rates, monetary statistics | Statistical bulletin, weekly bulletin, rates pages |
| National Treasury | Fiscal and budget data | Periodic reports |

**Neither KNBS nor CBK publishes an open, documented JSON API.** Their data is
released as pages and downloadable files, each with its own terms of use. This
project therefore does **not** scrape them. Observations enter the platform only
through operator-supplied files that were exported from the publisher under a
licence that permits the intended use.

## Catalogue

`src/data/economic-series.json` defines the series the platform is designed to
display. It contains **definitions and sourcing metadata only** — never values.

| Series id | Name | Unit | Frequency | Source |
| --- | --- | --- | --- | --- |
| `KE.KNBS.CPI.YOY` | Inflation rate (CPI, year-on-year) | % | monthly | KNBS |
| `KE.CBK.CBR` | Central Bank Rate (CBR) | % | event | CBK |
| `KE.CBK.TBILL.91` | 91-day Treasury bill rate | % | weekly | CBK |
| `KE.CBK.LENDING` | Commercial bank average lending rate | % | monthly | CBK |
| `KE.CBK.USD.KES` | USD / KES exchange rate | KES per USD | daily | CBK |
| `KE.KNBS.GDP.Q` | Real GDP growth (year-on-year) | % | quarterly | KNBS |
| `KE.KNBS.TRADE.BALANCE` | Trade balance | KES millions | monthly | KNBS |

Adding a series = one entry in that file. No code change is needed; the
catalogue is registered into `economic_indicators` on every
`npm run ingest:economy` run.

## Ingesting observations

1. Export the series from the publisher (CSV/XLSX).
2. Convert to a two-column CSV named after the series id:

   ```
   data/ingest/economy/KE.CBK.CBR.csv
   date,value
   2026-02-10,8.75
   2026-04-08,8.75
   2026-06-09,8.75
   ```

   `date` accepts `YYYY-MM-DD`, `DD/MM/YYYY`, `DD-MM-YYYY` and `DD-MMM-YYYY`.
   `value` tolerates thousands separators, currency codes and blanks.
3. Run:

   ```bash
   npm run ingest:economy          # reads data/ingest/economy/*.csv
   npm run ingest:economy -- --dir=/path/to/files
   ```

`data/ingest/` is a staging area for licensed files and is not committed by
default (see `.gitignore`).

## What the UI does with missing data

A series with no observations reports:

- `status: "awaiting-ingest"`
- `latestValue: null`
- the card renders **Data unavailable** with the publisher, the frequency and
  the series id

There is no interpolation, no back-fill and no estimation. An empty chart is
honest; a smooth line drawn between two unrelated publication dates is not.

## Licensing notes

- CBK and KNBS publish their statistics for public information, but
  **redistribution and commercial reuse have their own terms**. Confirm them for
  your use case before displaying or reselling derived figures.
- Each catalogue entry carries a `license` field; keep it accurate when adding
  series.
- The `/economy` page links back to the publisher and shows the series id, so
  any value on screen can be traced to its origin.

## Future work

- Charting per series with release-date markers (not evenly spaced points).
- Quarterly realignment: GDP and trade figures are period aggregates, so charts
  must not imply daily granularity.
- Currency and commodity series (e.g. USD/KES, tea and coffee auction prices)
  once a reliable, licensed source is identified.
- A "sources and methodology" page covering revision policy — KNBS revises
  historical GDP series, and the platform must be able to show that a value
  changed.
