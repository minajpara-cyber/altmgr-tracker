import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = name => JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));
const core = read('data-core.json');
const monthly = read('data-monthly.json');
const filings = read('data-filings.json');

const failures = [];
const check = (ok, message) => { if (!ok) failures.push(message); };
const qKey = label => {
  const [period, yearText] = String(label || '').split(' ');
  return (Number(yearText) || 0) * 10 + ({Q1:1,Q2:2,Q3:3,Q4:4,H1:1,H2:2,FY:5}[period] || 9);
};
const nav = q => {
  const main = q?.fund_nav_usd ?? q?.nav_eop ?? q?.total_net_assets_or_equity;
  return main == null ? null : main + (q.dst_nav_usd || 0);
};

check(core.universe.length > 0, 'Universe is empty');
check(core.quarters.length > 0, 'Quarterly data is empty');
check(new Set(core.universe.map(u => u.ticker)).size === core.universe.length, 'Universe contains duplicate tickers');

const grouped = new Map();
for (const q of core.quarters) {
  if (!grouped.has(q.ticker)) grouped.set(q.ticker, []);
  grouped.get(q.ticker).push(q);
  if (q.fund_nav_usd && q.total_assets) {
    check(q.fund_nav_usd / q.total_assets < 50, `${q.ticker} ${q.quarter_label}: implausible Fund NAV scale`);
  }
}
for (const rows of grouped.values()) rows.sort((a,b) => qKey(a.quarter_label) - qKey(b.quarter_label));
for (const u of core.universe) {
  check(grouped.has(u.ticker) || u.awaiting_first_financial_report === true,
    `${u.ticker}: no quarterly data and not marked as awaiting its first financial report`);
}

const latestTotal = [...grouped.values()].reduce((sum, rows) => sum + (nav(rows.at(-1)) || 0), 0);
check(latestTotal > 0, 'Latest universe NAV total is zero');

const buildDate = core.generated_at?.slice(0, 10);
for (const row of monthly.monthly || []) {
  check(!buildDate || row.as_of_date <= buildDate, `${row.ticker} ${row.as_of_date}: future monthly observation`);
}
for (let i = 1; i < (filings.filings || []).length; i++) {
  check(filings.filings[i - 1].filing_date >= filings.filings[i].filing_date, 'Filings are not newest-first');
}

// Monthly report tracker (site/evergreen.json, built by scripts/37). Optional:
// file is absent until that script has run, and its absence must not fail a
// deploy of the EDGAR site. When it IS present, the invariants the tab relies
// on are checked here so a broken payload never ships.
let evergreenMonths = 0;
const evergreenPath = path.join(root, 'evergreen.json');
if (fs.existsSync(evergreenPath)) {
  const eg = read('evergreen.json');
  check((eg.funds || []).length > 0, 'Monthly-report payload has no funds');
  const tickers = new Set((eg.funds || []).map(f => f.ticker));
  check(tickers.size === (eg.funds || []).length, 'Monthly-report funds contain duplicate tickers');
  for (const [ticker, segments] of Object.entries(eg.series || {})) {
    check(tickers.has(ticker), `${ticker}: monthly-report series with no fund row`);
    for (const seg of segments) {
      const c = seg.cols;
      const n = c.asof.length;
      evergreenMonths += n;
      // Parallel arrays must stay the same length or the page reads one
      // month's flow against another month's size.
      for (const [key, col] of Object.entries(c)) {
        check(col.length === n, `${ticker} ${seg.ccy}: column ${key} is ${col.length}, expected ${n}`);
      }
      for (let i = 0; i < n; i++) {
        check(!eg.data_through || c.asof[i] <= eg.data_through,
          `${ticker} ${c.asof[i]}: month after the payload's own coverage date`);
        // The published flow must be the published components' difference —
        // the page prints all three side by side.
        if (c.flow[i] != null && c.size_chg[i] != null && c.perf_effect[i] != null) {
          if ((c.flow_status || [])[i] === 'provisional_workbook_flow') {
            check((c.review_status || [])[i] === 'provisional'
              && (c.source_kind || [])[i] === 'user_supplied_workbook_photo',
            `${ticker} ${c.asof[i]}: provisional workbook flow lacks provisional photo provenance`);
            check(Math.abs(c.flow[i] - (c.workbook_flow_m || [])[i]) <= 0.02,
              `${ticker} ${c.asof[i]}: provisional flow differs from photographed workbook flow`);
            check((c.workbook_reconciliation_delta_m || [])[i] != null,
              `${ticker} ${c.asof[i]}: provisional workbook flow lacks a rounding reconciliation`);
          } else {
            check(Math.abs(c.flow[i] - (c.size_chg[i] - c.perf_effect[i])) <= 0.02,
              `${ticker} ${c.asof[i]}: flow does not equal size change less performance effect`);
          }
        }
      }
      for (let i = 1; i < n; i++) {
        check(c.asof[i - 1] < c.asof[i], `${ticker} ${seg.ccy}: months out of order at ${c.asof[i]}`);
      }
    }
  }
}

if (failures.length) {
  console.error(`Data validation failed (${failures.length}):`);
  for (const message of failures.slice(0, 25)) console.error(`- ${message}`);
  process.exit(1);
}

console.log(`Data validation passed: ${core.universe.length} funds, ${core.quarters.length} quarterly rows, ${(monthly.monthly || []).length} monthly rows, ${(filings.filings || []).length} filings, ${Math.round(latestTotal / 1e6).toLocaleString()}M latest NAV${evergreenMonths ? `, ${evergreenMonths} monthly-report months` : ''}.`);
