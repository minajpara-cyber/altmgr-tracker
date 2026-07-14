/* Alt-Manager Tracker — shared client code (quarterly redesign) */

const DATA_URL = './data-core.json';

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

// Per-share NAV in dollars (typically $20-$30 range). Negatives parenthesized.
function fmtUsd(v) {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  const body = '$' + Math.abs(v).toFixed(2);
  return v < 0 ? '(' + body + ')' : body;
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
const DATA_CACHE = new Map();
async function loadData(url = DATA_URL) {
  if (DATA_CACHE.has(url)) return DATA_CACHE.get(url);
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const data = await r.json();
    DATA_CACHE.set(url, data);
    return data;
  } catch (e) {
    document.body.insertAdjacentHTML('afterbegin',
      `<div class="error-msg">Failed to load ${url.replace('./', '')}: ${e.message}. If you opened this from file:// directly, run a local server instead.</div>`);
    throw e;
  }
}

// ---------- topbar refresh date ----------
async function paintRefreshDate(providedData = null) {
  try {
    const d = providedData || await loadData();
    const el = document.getElementById('refresh-meta');
    if (!el) return;
    const period = d.financial_period_through || d.data_through;
    const refreshed = d.generated_at
      ? new Date(d.generated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      : null;
    el.textContent = `Financials through ${fmtDate(period)}${refreshed ? ` · refreshed ${refreshed}` : ''}`;
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

// One NAV definition used everywhere: manager-published Fund NAV for REITs,
// otherwise period-end NAV/equity, plus any separately reported DST sleeve.
function effectiveNav(q) {
  if (!q) return null;
  const main = q.fund_nav_usd != null ? q.fund_nav_usd
    : q.nav_eop != null ? q.nav_eop
    : q.total_net_assets_or_equity;
  return main == null ? null : main + (q.dst_nav_usd || 0);
}

function latestQuarterRows(quarters) {
  const grouped = groupQuartersByTicker(quarters || []);
  return new Map([...grouped].map(([ticker, rows]) => [ticker, rows[rows.length - 1]]));
}

function downloadCsv(filename, rows) {
  if (!rows || !rows.length) return;
  const keys = [...new Set(rows.flatMap(r => Object.keys(r)))];
  const esc = (v) => {
    if (v == null) return '';
    const s = Array.isArray(v) ? v.join('; ') : String(v);
    return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  const csv = [keys.join(','), ...rows.map(r => keys.map(k => esc(r[k])).join(','))].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function enhanceSiteShell() {
  if (!document.querySelector('link[rel="icon"]')) {
    const icon = document.createElement('link');
    icon.rel = 'icon';
    icon.href = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="8" fill="#131313"/><path d="M14 46 27 16h9l14 30h-9l-3-8H25l-3 8zm14-15h8l-4-10z" fill="#d58a16"/></svg>');
    document.head.appendChild(icon);
  }
  const header = document.querySelector('header.topbar');
  if (!header) return;
  const brand = header.querySelector('.brand');
  if (brand && brand.tagName !== 'A') {
    const home = document.createElement('a');
    home.className = brand.className;
    home.href = './index.html';
    home.setAttribute('aria-label', 'Alt-Manager Tracker home');
    home.innerHTML = brand.innerHTML;
    brand.replaceWith(home);
  }
  const nav = header.querySelector('nav');
  if (!nav) return;
  nav.setAttribute('aria-label', 'Primary navigation');
  for (const link of nav.querySelectorAll('a[href="./fund.html"]')) {
    link.href = './index.html#funds';
    link.textContent = 'Find fund';
  }
  if (!nav.querySelector('a[href="./methodology.html"]')) {
    const method = document.createElement('a');
    method.href = './methodology.html';
    method.textContent = 'Methodology';
    nav.appendChild(method);
  }
  const button = document.createElement('button');
  button.className = 'nav-toggle';
  button.type = 'button';
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-label', 'Open navigation');
  button.textContent = 'Menu';
  button.addEventListener('click', () => {
    const open = header.classList.toggle('nav-open');
    button.setAttribute('aria-expanded', String(open));
    button.textContent = open ? 'Close' : 'Menu';
  });
  header.insertBefore(button, nav);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', enhanceSiteShell);
} else {
  enhanceSiteShell();
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
