# Ingestion staging area

This directory holds **data files you have obtained under licence** (official NSE
end-of-day statistics, CBK/KNBS exports) before they are imported into the
database. Nothing here is fetched automatically and nothing here is committed by
default — see `.gitignore`.

```
data/ingest/
├── nse/                     # end-of-day equity files  → npm run ingest:eod -- --dir=data/ingest/nse
│   └── nse-eod-2026-09-19.csv
└── economy/                 # economic series files    → npm run ingest:economy
    └── KE.CBK.CBR.csv
```

## NSE end-of-day CSV

Headers are matched by alias, so most vendor exports work without editing:

| Field    | Accepted headers                                    |
| -------- | --------------------------------------------------- |
| date     | `date`, `trade_date`, `session`, `trading_date`     |
| ticker   | `ticker`, `symbol`, `code`, `security`              |
| open     | `open`, `opening_price`                             |
| high     | `high`, `day_high`, `highest`                       |
| low      | `low`, `day_low`, `lowest`                          |
| close    | `close`, `closing_price`, `last`, `price`           |
| volume   | `volume`, `shares_traded`, `traded_volume`          |
| turnover | `turnover`, `value`, `value_traded`, `turnover_kes` |

Rows for tickers that are not in `src/data/companies.json` are skipped rather
than auto-created, so a typo in an export cannot invent a listing.

## Economic series CSV

One file per series, named after the series id, with a `date,value` header:

```
data/ingest/economy/KE.CBK.CBR.csv
date,value
2026-02-10,8.75
2026-04-08,8.75
```

See `docs/economy-data.md` for sourcing and licensing rules.
