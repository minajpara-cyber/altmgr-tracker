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
for (const u of core.universe) check(grouped.has(u.ticker), `${u.ticker}: no quarterly data`);

const latestTotal = [...grouped.values()].reduce((sum, rows) => sum + (nav(rows.at(-1)) || 0), 0);
check(latestTotal > 0, 'Latest universe NAV total is zero');

const buildDate = core.generated_at?.slice(0, 10);
for (const row of monthly.monthly || []) {
  check(!buildDate || row.as_of_date <= buildDate, `${row.ticker} ${row.as_of_date}: future monthly observation`);
}
for (let i = 1; i < (filings.filings || []).length; i++) {
  check(filings.filings[i - 1].filing_date >= filings.filings[i].filing_date, 'Filings are not newest-first');
}

if (failures.length) {
  console.error(`Data validation failed (${failures.length}):`);
  for (const message of failures.slice(0, 25)) console.error(`- ${message}`);
  process.exit(1);
}

console.log(`Data validation passed: ${core.universe.length} funds, ${core.quarters.length} quarterly rows, ${(monthly.monthly || []).length} monthly rows, ${(filings.filings || []).length} filings, ${Math.round(latestTotal / 1e6).toLocaleString()}M latest NAV.`);
