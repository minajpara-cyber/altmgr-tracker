# Alt-Manager Non-Traded Product Tracker

A static, no-build website that visualizes SEC EDGAR financial data for 30
non-traded alternative-asset products (BDCs, REITs, interval funds, etc.)
sponsored by firms like Blackstone, Apollo, KKR, Ares, Blue Owl, Brookfield,
Carlyle, TPG, and others.

Built from the output of the `altmgr_inventory` Python extractors:

- `output/master_combined.csv` — 420 filing-period rows, 39 columns
- `output/universe_final.csv` — 31-fund sponsor / strategy / form-factor metadata

## Pages

- **Universe** (`index.html`) — sortable, filterable summary of all funds.
- **Fund detail** (`fund.html?ticker=BCRED`) — NAV time series, capital-flow
  breakdown, and full underlying data table (CSV-exportable).
- **Compare** (`compare.html`) — multi-fund chart with metric, time window, and
  sponsor / strategy quick-select filters.

Non-SEC coverage: Partners Group's non-US evergreens (Lux SICAVs + the
Guernsey Partners Fund Trust) are extracted from their public annual /
semi-annual reports on partnersgroup.com (template F, scripts/25) and flow
through the same master/quarterly pipeline as the SEC filers — they appear
in every page like any other fund, in USD (PGGV translated at period-end
ECB rates), at H1/FY cadence.

## Running locally

No build step. From this folder:

```
python3 -m http.server 8000
```

then open <http://localhost:8000/index.html>.

## Refreshing the data

After re-running the extractors:

```
~/Downloads/bdc_inventory/.venv/bin/python scripts/08_build_site.py
```

This regenerates `site/data.json`.

## Deployment

See [DEPLOY.md](./DEPLOY.md) for a step-by-step GitHub Pages walkthrough.

## Disclaimer

Data is extracted from publicly filed SEC documents. Errors are possible — this
site is for research only and is not investment advice.
