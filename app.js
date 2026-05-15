/* Alt-Manager Tracker — shared client code (quarterly redesign) */

const DATA_URL = './data.json';

// ---------- formatters ----------
// Money in $ MILLIONS only. Negatives parenthesized.
function fmtM(v) {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  const m = v / 1e6;
  const abs = Math.abs(m);
  let body;
  if (abs >= 1000) body = '$' + abs.toLocaleString('en-US', { maximumFractionDigits: 0 }) + 'M';
  else if (abs >= 100) body = '$' + abs.toFixed(0) + 'M';
  else if (abs >= 10) body = '$' + abs.toFixed(1) + 'M';
  else body = '$' + abs.toFixed(2) + 'M';
  return v < 0 ? '(' + body + ')' : body;
}

// Backwards-compat alias for any code that still calls fmtMoney.
function fmtMoney(v) { return fmtM(v); }

function fmtMSigned(v) {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  if (v < 0) return fmtM(v); // already parenthesized
  return '+' + fmtM(v);
}

function fmtPct(v) {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  return (v * 100).toFixed(1) + '%';
}

function fmtPctSigned(v) {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  const s = (v * 100).toFixed(1) + '%';
  return v > 0 ? '+' + s : s;
}

function fmtInt(v) {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  return v.toLocaleString();
}

function fmtDate(v) {
  if (!v) return '—';
  return v.substring(0, 10);
}

// Color class for a numeric cell value
function signClass(v) {
  if (v === null || v === undefined || Number.isNaN(v)) return 'zero';
  if (v > 0) return 'pos';
  if (v < 0) return 'neg';
  return 'zero';
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
    if (el) el.textContent = 'Data through ' + fmtDate(d.data_through);
  } catch { /* surfaced above */ }
}

// ---------- helpers ----------
function quarterSortKey(label) {
  // "Q1 2024", "H1 2024", "FY 2024"
  const parts = (label || '').split(' ');
  const year = parseInt(parts[parts.length - 1], 10) || 0;
  const prefix = parts[0] || '';
  const order = { Q1: 1, Q2: 2, Q3: 3, Q4: 4, H1: 1, H2: 2, FY: 5 };
  const oi = order[prefix] || 9;
  return year * 10 + oi;
}

function groupQuartersByTicker(quarters) {
  const m = new Map();
  for (const q of quarters) {
    if (!m.has(q.ticker)) m.set(q.ticker, []);
    m.get(q.ticker).push(q);
  }
  for (const arr of m.values()) {
    arr.sort((a, b) => quarterSortKey(a.quarter_label) - quarterSortKey(b.quarter_label));
  }
  return m;
}

function colorPalette(n) {
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
