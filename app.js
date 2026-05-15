/* Alt-Manager Tracker — shared client code */

const DATA_URL = './data.json';

// ---------- formatters ----------
function fmtMoney(v) {
  if (v === null || v === undefined || isNaN(v)) return '—';
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (abs >= 1e9) return sign + '$' + (abs / 1e9).toFixed(2) + 'B';
  if (abs >= 1e6) return sign + '$' + (abs / 1e6).toFixed(2) + 'M';
  if (abs >= 1e3) return sign + '$' + (abs / 1e3).toFixed(1) + 'K';
  return sign + '$' + abs.toFixed(0);
}

function fmtMoneySigned(v) {
  if (v === null || v === undefined || isNaN(v)) return '—';
  const s = fmtMoney(v);
  return v > 0 ? '+' + s : s;
}

function fmtPct(v) {
  if (v === null || v === undefined || isNaN(v)) return '—';
  return (v * 100).toFixed(1) + '%';
}

function fmtPctSigned(v) {
  if (v === null || v === undefined || isNaN(v)) return '—';
  const s = (v * 100).toFixed(1) + '%';
  return v > 0 ? '+' + s : s;
}

function fmtInt(v) {
  if (v === null || v === undefined || isNaN(v)) return '—';
  return v.toLocaleString();
}

function fmtDate(v) {
  if (!v) return '—';
  return v.substring(0, 10);
}

// Tabulator cell formatters
function moneyCell(cell) {
  const v = cell.getValue();
  return fmtMoney(v);
}
function moneySignedCell(cell) {
  const v = cell.getValue();
  const el = document.createElement('span');
  el.textContent = fmtMoneySigned(v);
  if (v > 0) el.className = 'pos';
  else if (v < 0) el.className = 'neg';
  return el;
}
function pctCell(cell) {
  return fmtPct(cell.getValue());
}
function pctSignedCell(cell) {
  const v = cell.getValue();
  const el = document.createElement('span');
  el.textContent = fmtPctSigned(v);
  if (v > 0) el.className = 'pos';
  else if (v < 0) el.className = 'neg';
  return el;
}

// ---------- data loader ----------
let DATA_CACHE = null;
async function loadData() {
  if (DATA_CACHE) return DATA_CACHE;
  try {
    const r = await fetch(DATA_URL);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    DATA_CACHE = await r.json();
    return DATA_CACHE;
  } catch (e) {
    document.body.insertAdjacentHTML('afterbegin',
      `<div class="error-msg">Failed to load data.json: ${e.message}. If you opened this from file:// directly, run a local server instead (cd site && python3 -m http.server 8000) or deploy to GitHub Pages.</div>`);
    throw e;
  }
}

// ---------- topbar refresh date ----------
async function paintRefreshDate() {
  try {
    const d = await loadData();
    const el = document.getElementById('refresh-meta');
    if (el) {
      el.textContent = 'Data through ' + fmtDate(d.data_through);
    }
  } catch { /* already surfaced */ }
}

// ---------- helpers ----------
function groupByTicker(filings) {
  const m = new Map();
  for (const f of filings) {
    if (!m.has(f.ticker)) m.set(f.ticker, []);
    m.get(f.ticker).push(f);
  }
  for (const arr of m.values()) {
    arr.sort((a, b) => (a.filing_date || '').localeCompare(b.filing_date || ''));
  }
  return m;
}

function colorPalette(n) {
  // 30 distinguishable colors (categorical)
  const base = [
    '#1f5fa6', '#c47a00', '#2c9f3a', '#c0392b', '#7b3f99',
    '#0e7c86', '#d35400', '#16a085', '#8e44ad', '#2e4053',
    '#5d6d7e', '#b9770e', '#117a65', '#922b21', '#1a5276',
    '#7d6608', '#0e6251', '#6c3483', '#943126', '#196f3d',
    '#7e5109', '#283747', '#4a235a', '#641e16', '#0b5345',
    '#7b241c', '#154360', '#9a7d0a', '#1b4f72', '#52be80'
  ];
  const out = [];
  for (let i = 0; i < n; i++) out.push(base[i % base.length]);
  return out;
}
