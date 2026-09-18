/* Monthly report tracker — funds tracked from the manager's own monthly reports.

   Wrapped in an IIFE: app.js owns global fmtM/fmtPct/signClass, and a
   top-level const redeclaration is a SyntaxError that silently kills the
   whole script (see fundrecords.js for the same guard).

   The one rule this page exists to keep: a fund's series is never plotted
   across a change of reporting currency. The payload delivers one segment
   per currency era and the currency picker switches between them; see
   scripts/37_build_evergreen_site.py for why PGGV and PG_LOANS need it. */
(() => {
const SYM = {USD: "$", EUR: "€", CHF: "CHF ", GBP: "£", AUD: "A$"};
let D = null, FUND = null, SEG = 0, charts = {};

const sym = ccy => SYM[ccy] || ((ccy || "") + " ");
const num = (v, dp = 2) => v == null ? "·"
  : v.toLocaleString("en-US", {minimumFractionDigits: dp, maximumFractionDigits: dp});
// Fund size and flows are already in millions in the source data. The sign
// goes before the currency symbol — "$-6.0m" reads as a broken string.
const money = (v, ccy, dp = 1) => v == null ? "·"
  : (v < 0 ? "−" : "") + sym(ccy) + num(Math.abs(v), dp) + "m";
const moneySigned = (v, ccy, dp = 1) => v == null ? "·"
  : (v >= 0 ? "+" : "−") + sym(ccy) + num(Math.abs(v), dp) + "m";
const pct = (v, dp = 2) => v == null ? "·" : num(v, dp) + "%";
const pctSigned = (v, dp = 2) => v == null ? "·"
  : (v >= 0 ? "+" : "−") + num(Math.abs(v), dp) + "%";
const cls = v => v == null ? "zero" : v > 0 ? "pos" : v < 0 ? "neg" : "zero";
const month = d => d ? d.slice(0, 7) : "·";

const fundOf = t => D.funds.find(f => f.ticker === t);
// Segments long enough to be a real reporting-currency era. The payload keeps
// the short ones so the count stays visible, but they are not plottable.
// A brand-new fund can have only short ones; show them rather than nothing.
const segsOf = t => {
  const all = D.series[t] || [];
  const long = all.filter(s => s.cols.asof.length >= D.min_segment_months);
  return long.length ? long : all;
};

// Deliberately NOT calling app.js's paintRefreshDate(): it reads data-core.json
// and would race this page's own header label to "Financials through …". The
// EDGAR refresh date is not this tab's coverage date — these funds publish on
// Partners Group's calendar, not on EDGAR's.

fetch("./evergreen.json", {cache: "no-store"})
  .then(r => {
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  })
  .then(d => {
    D = d;
    meta(); stats(); overviewTable(); initPickers(); initViews();
    renderFund(); renderClasses(); renderStatements();
  })
  .catch(e => {
    document.body.insertAdjacentHTML("afterbegin",
      `<div class="error-msg">Failed to load evergreen.json: ${e.message}. ` +
      `Run <code>python3 scripts/37_build_evergreen_site.py</code> to build it.</div>`);
  });

function meta() {
  const el = document.getElementById("refresh-meta");
  if (el) el.textContent = `Monthly reports through ${month(D.data_through)}`
    + (D.built ? ` · built ${D.built}` : "");
}

function stats() {
  const months = D.funds.reduce((a, f) => a + f.n_months, 0);
  const flows = D.funds.reduce((a, f) => a + f.n_flow_months, 0);
  const latest = D.funds.filter(f => f.latest_month === D.data_through).length;
  document.getElementById("st-funds").textContent = D.funds.length;
  // Name the sources rather than assume one. With a single source this reads
  // as it always did; with several it says how the funds split between them.
  const srcs = D.sources || [];
  document.getElementById("st-funds-sub").textContent =
    srcs.length === 1 ? srcs[0].label
      : srcs.map(s => `${s.label} (${s.n_funds})`).join(" · ");
  const wh = D.funds.reduce((a, f) => a + f.n_withheld_months, 0);
  document.getElementById("st-months").textContent = months.toLocaleString();
  document.getElementById("st-months-sub").textContent =
    `${flows.toLocaleString()} with an implied flow`
    + (wh ? ` · ${wh} withheld` : "");
  document.getElementById("st-earliest").textContent =
    month(D.funds.reduce((a, f) => !a || f.first_month < a ? f.first_month : a, null));
  document.getElementById("st-latest").textContent = month(D.data_through);
  document.getElementById("st-latest-sub").textContent =
    `${latest} of ${D.funds.length} funds current`;
}

function overviewTable() {
  const head = ["Fund", "Strategy", "Ccy", "Latest", "NAV / share",
                "Fund size", "Flow (mo)", "Flow (TTM)", "Return (TTM)",
                "Months", "From"];
  let h = "<tr>" + head.map(c => `<th>${c}</th>`).join("") + "</tr>";
  const rows = [...D.funds].sort((a, b) =>
    (b.latest_size_m || 0) - (a.latest_size_m || 0));
  for (const f of rows) {
    const withheld = f.n_withheld_months
      ? `<span class="badge warn" title="Factsheet month(s) the chain `
        + `cross-check rejected — a misparsed NAV or fund size. Withheld, not `
        + `charted.">${f.n_withheld_months} withheld</span>`
      : "";
    h += "<tr>"
      + `<td><a href="#" data-goto="${f.ticker}">${f.ticker}</a>${withheld}<div class="sub" `
      + `style="font-size:11px;color:var(--text-faint)">${f.legal_name || ""}</div></td>`
      + `<td style="text-align:left">${f.strategy || "·"}</td>`
      + `<td style="text-align:left">${f.ccy || "·"}</td>`
      + `<td>${month(f.latest_month)}</td>`
      + `<td>${f.latest_navps == null ? "·" : sym(f.ccy) + num(f.latest_navps)}</td>`
      + `<td>${money(f.latest_size_m, f.ccy)}</td>`
      + `<td class="${cls(f.latest_flow_m)}">${moneySigned(f.latest_flow_m, f.ccy)}</td>`
      + `<td class="${cls(f.ttm_flow_m)}">${moneySigned(f.ttm_flow_m, f.ccy)}</td>`
      + `<td class="${cls(f.ttm_return_pct)}">${pctSigned(f.ttm_return_pct, 1)}</td>`
      + `<td>${f.n_flow_months}</td>`
      + `<td>${month(f.first_flow_month)}</td>`
      + "</tr>";
  }
  const tbl = document.getElementById("tbl-funds");
  tbl.innerHTML = h;
  tbl.addEventListener("click", ev => {
    const a = ev.target.closest("[data-goto]");
    if (!a) return;
    ev.preventDefault();
    document.getElementById("fund-pick").value = a.dataset.goto;
    FUND = a.dataset.goto; SEG = 0;
    paintCcyPicker(); renderFund();
    showView("fund");
  });

  const multi = D.funds.filter(f => f.currencies.length > 1);
  document.getElementById("fn-overview").innerHTML =
    `Flow (TTM) sums the last twelve months that carry a flow, and is shown `
    + `only where at least six of them do. Return (TTM) compounds the same `
    + `window's monthly NAV returns. Both are computed within the fund's `
    + `current reporting currency.`
    + (multi.length
      ? ` ${multi.length} fund${multi.length > 1 ? "s have" : " has"} reported `
        + `in more than one currency over time `
        + `(${multi.map(f => f.ticker + ": "
            + f.currencies.map(c => c.ccy).join("/")).join(", ")}); `
        + `each era is charted separately.`
      : "");
}

function initPickers() {
  const opts = D.funds.map(f =>
    `<option value="${f.ticker}">${f.ticker} — ${f.legal_name || ""}</option>`).join("");
  const fp = document.getElementById("fund-pick");
  const cp = document.getElementById("cls-fund-pick");
  fp.innerHTML = opts;
  // Largest fund first: it is the one most likely to be looked at.
  FUND = [...D.funds].sort((a, b) =>
    (b.latest_size_m || 0) - (a.latest_size_m || 0))[0].ticker;
  fp.value = FUND;
  cp.innerHTML = D.funds
    .filter(f => (D.pershare[f.ticker] || []).length)
    .map(f => `<option value="${f.ticker}">${f.ticker} — ${f.legal_name || ""}</option>`)
    .join("");
  paintCcyPicker();

  fp.addEventListener("change", () => {
    FUND = fp.value; SEG = 0; paintCcyPicker(); renderFund();
  });
  document.getElementById("ccy-pick").addEventListener("change", ev => {
    SEG = Number(ev.target.value); renderFund();
  });
  cp.addEventListener("change", renderClasses);
}

function paintCcyPicker() {
  const segs = segsOf(FUND);
  const sel = document.getElementById("ccy-pick");
  sel.innerHTML = segs.map((s, i) =>
    `<option value="${i}">${s.ccy} — ${month(s.cols.asof[0])} to `
    + `${month(s.cols.asof[s.cols.asof.length - 1])} (${s.cols.asof.length} mo)</option>`
  ).join("");
  sel.value = String(SEG);
  // One currency era means nothing to choose between; hide the control rather
  // than show a picker with a single option.
  sel.parentElement.style.display = segs.length > 1 ? "" : "none";
}

function renderFund() {
  const f = fundOf(FUND);
  const segs = segsOf(FUND);
  const seg = segs[SEG] || segs[0];
  const c = seg.cols, ccy = seg.ccy;

  document.getElementById("fd-title").textContent =
    `${f.ticker} — ${f.legal_name || ""}`;
  const withheldNote = f.n_withheld_months
    ? ` · ${f.n_withheld_months} factsheet month`
      + `${f.n_withheld_months > 1 ? "s" : ""} withheld as unvalidated`
    : "";
  document.getElementById("fd-sub").textContent =
    `${f.strategy || ""} · ${f.sponsor || ""}`
    + `${f.source ? ` · ${f.source}` : ""}`
    + ` · reporting in ${ccy}`
    + `${seg.lead_class ? ` (lead class ${seg.lead_class})` : ""}`
    + ` · ${c.asof.length} months, ${month(c.asof[0])} to `
    + `${month(c.asof[c.asof.length - 1])}${withheldNote}`;

  drawChart("flowChart", {
    labels: c.asof.map(month),
    datasets: [
      {type: "bar", label: `Implied net flow (${ccy}m)`, yAxisID: "y2",
       data: c.flow,
       backgroundColor: c.flow.map(v => (v || 0) >= 0
         ? "rgba(11,107,50,0.45)" : "rgba(176,45,33,0.45)")},
      {type: "line", label: `Fund size (${ccy}m)`, yAxisID: "y1",
       data: c.size, borderColor: "#1f5fa6",
       backgroundColor: "rgba(31,95,166,0.10)",
       borderWidth: 1.8, tension: 0.15, fill: true, spanGaps: true,
       pointRadius: 0},
    ],
  }, {
    y1: {position: "left", title: {display: true, text: `Fund size (${ccy}m)`}},
    y2: {position: "right", title: {display: true, text: `Flow (${ccy}m)`},
         grid: {drawOnChartArea: false}},
  });

  drawChart("navpsChart", {
    labels: c.asof.map(month),
    datasets: [
      {type: "line", label: `NAV per share (${ccy})`, yAxisID: "y1",
       data: c.navps, borderColor: "#955b00", borderWidth: 1.8,
       tension: 0.15, fill: false, spanGaps: true, pointRadius: 0},
    ],
  }, {
    y1: {position: "left", title: {display: true, text: `NAV / share (${ccy})`}},
  });

  monthTable(seg);
}

function drawChart(id, data, scales) {
  if (charts[id]) charts[id].destroy();
  charts[id] = new Chart(document.getElementById(id).getContext("2d"), {
    data,
    options: {
      responsive: true, maintainAspectRatio: false, animation: false,
      interaction: {mode: "index", intersect: false},
      plugins: {legend: {labels: {boxWidth: 12, font: {size: 11}}}},
      scales: Object.assign({
        x: {ticks: {maxTicksLimit: 14, font: {size: 10}}, grid: {display: false}},
      }, scales),
    },
  });
}

function monthTable(seg) {
  const c = seg.cols, ccy = seg.ccy;
  const head = ["Month", "NAV / share", "Return", "Fund size", "Size change",
                "Performance effect", "Implied net flow", "% of NAV"];
  let h = "<tr>" + head.map(x => `<th>${x}</th>`).join("") + "</tr>";
  // Newest first: the recent months are what a reader checks.
  for (let i = c.asof.length - 1; i >= 0; i--) {
    h += "<tr>"
      + `<td>${month(c.asof[i])}</td>`
      + `<td>${c.navps[i] == null ? "·" : sym(ccy) + num(c.navps[i])}</td>`
      + `<td class="${cls(c.ret[i])}">${pctSigned(c.ret[i])}</td>`
      + `<td>${money(c.size[i], ccy)}</td>`
      + `<td class="${cls(c.size_chg[i])}">${moneySigned(c.size_chg[i], ccy)}</td>`
      + `<td class="${cls(c.perf_effect[i])}">${moneySigned(c.perf_effect[i], ccy)}</td>`
      + `<td class="${cls(c.flow[i])}"><b>${moneySigned(c.flow[i], ccy)}</b></td>`
      + `<td class="${cls(c.flow_pct[i])}">${pctSigned(c.flow_pct[i])}</td>`
      + "</tr>";
  }
  document.getElementById("tbl-months").innerHTML = h;
}

function renderClasses() {
  const pick = document.getElementById("cls-fund-pick");
  const rows = D.pershare[pick.value] || [];
  if (!rows.length) {
    document.getElementById("tbl-classes").innerHTML =
      '<tr><td>No share-class detail published for this fund.</td></tr>';
    return;
  }
  // Classes down the side, year-ends across: that is how the annual reports
  // print it and how classes are actually compared.
  const years = [...new Set(rows.map(r => r.asof))].sort();
  const byClass = new Map();
  for (const r of rows) {
    const key = `${r.cls}|${r.ccy}`;
    if (!byClass.has(key)) byClass.set(key, {});
    byClass.get(key)[r.asof] = r.navps;
  }
  // Label with year-month, not year: these funds report half-yearly as well as
  // at year-end, so 2024-06 and 2024-12 both exist and a bare "2024" would
  // head two different columns with the same name.
  let h = "<tr><th>Class</th><th>Ccy</th>"
    + years.map(y => `<th>${y.slice(0, 7)}</th>`).join("") + "</tr>";
  for (const [key, vals] of [...byClass].sort((a, b) => a[0].localeCompare(b[0]))) {
    const [cl, ccy] = key.split("|");
    h += `<tr><td>${cl}</td><td style="text-align:left">${ccy}</td>`
      + years.map(y => `<td>${vals[y] == null ? "·" : num(vals[y])}</td>`).join("")
      + "</tr>";
  }
  document.getElementById("tbl-classes").innerHTML = h;
}

function renderStatements() {
  const head = ["Fund", "Period end", "Months", "Kind", "Ccy", "Net assets",
                "Subscriptions", "Redemptions", "Net flows", "Mgmt fees",
                "Perf fees", "Net income"];
  let h = "<tr>" + head.map(c => `<th>${c}</th>`).join("") + "</tr>";
  const all = [];
  for (const [ticker, rows] of Object.entries(D.statements || {})) {
    for (const r of rows) all.push([ticker, r]);
  }
  all.sort((a, b) => (b[1].period_end || "").localeCompare(a[1].period_end || "")
    || a[0].localeCompare(b[0]));
  // Statements are in full units, so scale to millions for readability.
  const m = (v, ccy) => v == null ? "·" : money(v / 1e6, ccy);
  const ms = (v, ccy) => v == null ? "·" : moneySigned(v / 1e6, ccy);
  for (const [ticker, r] of all) {
    h += "<tr>"
      + `<td>${ticker}</td>`
      + `<td>${r.period_end || "·"}</td>`
      + `<td>${r.period_months == null ? "·" : r.period_months}</td>`
      + `<td style="text-align:left">${r.report_kind || "·"}</td>`
      + `<td style="text-align:left">${r.ccy || "·"}</td>`
      + `<td>${m(r.total_net_assets, r.ccy)}</td>`
      + `<td class="pos">${m(r.subscriptions_gross, r.ccy)}</td>`
      + `<td class="neg">${m(r.redemptions_gross, r.ccy)}</td>`
      + `<td class="${cls(r.net_flows)}">${ms(r.net_flows, r.ccy)}</td>`
      + `<td>${m(r.management_fees, r.ccy)}</td>`
      + `<td>${m(r.performance_fees, r.ccy)}</td>`
      + `<td class="${cls(r.net_inc_from_ops)}">${ms(r.net_inc_from_ops, r.ccy)}</td>`
      + "</tr>";
  }
  document.getElementById("tbl-statements").innerHTML = h;
}

function showView(name) {
  for (const b of document.querySelectorAll("#egpills button")) {
    b.classList.toggle("active", b.dataset.view === name);
  }
  for (const s of document.querySelectorAll(".egview")) {
    s.classList.toggle("active", s.dataset.view === name);
  }
  // Chart.js sizes to a hidden container as zero; re-measure once visible.
  for (const c of Object.values(charts)) c.resize();
}

function initViews() {
  document.getElementById("egpills").addEventListener("click", ev => {
    const b = ev.target.closest("button");
    if (b) showView(b.dataset.view);
  });
}
})();
