# Alt-Manager Non-Traded Product Tracker

A static, no-build website that visualizes financial data for 70 non-traded
alternative-asset products (BDCs, REITs, interval funds, etc.) sponsored by
firms like Blackstone, Apollo, KKR, Ares, Blue Owl, Brookfield, Carlyle, TPG,
and others. Most funds are extracted from SEC EDGAR filings; Partners Group's
seven non-US evergreens (Lux SICAVs + the Guernsey Partners Fund Trust) are
extracted from their public annual/semi-annual reports on partnersgroup.com
(template F, scripts/25) and flow through the same pipeline — shown in USD
(PGGV translated at period-end ECB rates) at H1/FY cadence.

Built from the output of the `altmgr_inventory` Python extractors:

- `output/quarterly_combined.csv` — normalized filing-period observations
- `output/universe_final.csv` — sponsor / strategy / form-factor metadata

## Pages

- **Universe** (`index.html`) — sortable, filterable summary of all funds.
- **Fund detail** (`fund.html?ticker=BCRED`) — NAV time series, capital-flow
  breakdown, and full underlying data table (CSV-exportable).
- **Compare** (`compare.html`) — multi-fund chart with metric, time window, and
  sponsor / strategy quick-select filters.
- **Methodology** (`methodology.html`) — definitions, source hierarchy, and limitations.

## Running locally

No build step. From this folder:

```
python3 -m http.server 8000
```

then open <http://localhost:8000/index.html>.

## Refreshing the data

After re-running the extractors:

```
cd ~/Downloads/altmgr_inventory
~/Downloads/bdc_inventory/.venv/bin/python scripts/08_build_site.py
cp site/data*.json ~/Downloads/altmgr-tracker/
```

This regenerates the full archive plus page-specific payloads: `data-core.json`,
`data-monthly.json`, and `data-filings.json`. The site uses the smaller payload
appropriate to each page.

Validate a refresh before publishing:

```
node scripts/validate-data.mjs
```

## Deployment

See [DEPLOY.md](./DEPLOY.md) for a step-by-step GitHub Pages walkthrough.

## Disclaimer

Data is extracted from publicly filed SEC documents. Errors are possible — this
site is for research only and is not investment advice.
