/* Monthly filing scrape (formerly "Monthly Reports") — funds tracked from the manager's own monthly reports.

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
const esc = value => String(value ?? "").replace(/[&<>"']/g, ch =>
  ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[ch]));
const link = (url, label) => {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" || u.username || u.password) return esc(label);
    return `<a href="${esc(u.href)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>`;
  } catch (_) { return esc(label); }
};
// funds[].latest_source (script 37, scripts/latest_source.py): the newest
// month's document and when the pipeline first had it. Dates stay ISO strings
// formatted by hand: new Date("2026-09-28") is UTC midnight and prints 27 Sep
// west of GMT.
const MONTHS3 = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const longDay = d => {
  const m = /^(\d{4})-(\d\d)-(\d\d)/.exec(d || "");
  return m ? `${+m[3]} ${MONTHS3[+m[2] - 1]} ${m[1]}` : "";
};
const longMonth = d => {
  const m = /^(\d{4})-(\d\d)/.exec(d || "");
  return m ? `${MONTHS3[+m[2] - 1]} ${m[1]}` : "·";
};
const srcDate = s => s && s.date ? `${s.date_label || "dated"} ${longDay(s.date)}` : "";
const srcTitle = s => !s ? "" : `Latest month ${longMonth(s.month)} — source: ${s.label}`
  + (s.date ? `; ${srcDate(s)}` : "; date not recorded")
  + (s.published ? `; publisher's file dated ${longDay(s.published)}` : "")
  + (s.detail ? `; ${s.detail}` : "");
// "Aug 2026 · Fact card · first seen 24 Sep 2026", the document linked.
const srcLine = (s, labelKey = "short") => !s ? "" : `${esc(longMonth(s.month))} · `
  + (s.url ? link(s.url, s[labelKey] || s.label) : esc(s[labelKey] || s.label))
  + (s.date ? ` · ${esc(srcDate(s))}` : "");
// The block (currency segment) whose last month is the fund's latest month.
const isLatestSeg = (f, seg) => !!(f && f.latest_source) && seg.ccy === f.ccy
  && seg.cols.asof[seg.cols.asof.length - 1] === f.latest_source.month;
const managerName = key => ({partners_group: "Partners Group", hamilton_lane: "Hamilton Lane",
  carlyle: "Carlyle", stepstone: "StepStone", ares: "Ares", blackstone: "Blackstone", kkr: "KKR"}[key] || key);
// Flow figures STATED by the manager or its SEC filing (Ares' AESIF page
// footnote; N-PORT sales and redemptions). Shown beside the estimate only.
const SUBS_NOTE = "Gross subscriptions as stated by the manager or its N-PORT filing for the month; "
  + "not netted against redemptions and not an estimate.";
const REDEEM_NOTE = "Redemptions / repurchases as stated in the fund's N-PORT filing for the month "
  + "(published quarterly, about 60 days after quarter-end).";
// A fact card prints AUM, rounded ($6.4B), not total net assets: script 38
// shows it in the NAV / AUM* row and never differences it into a flow.
const aumNote = (precision, ccy) => "AUM printed on the manager's fact card"
  + (precision != null ? `, rounded to about ±${sym(ccy)}${precision}m` : "")
  + "; not verified as total net assets and never used for implied flows";
// The fund table's size carries the matrix's asterisk when it is not total net
// assets (a fact card's AUM, or a workbook figure not established as one).
const sizeMark = f => f.latest_size_m == null || !f.latest_size_measure
  || f.latest_size_measure === "total_net_assets" ? ""
  : `<span title="${esc(f.latest_size_measure === "aum"
      ? aumNote(null, f.ccy)
      : "Reported size not established as total net assets (AUM or an unverified figure); "
        + "never used for implied flows")}">*</span>`;
const hasSubs = c => (c.reported_subscriptions_m || []).some(v => v != null);
const hasRedeem = c => (c.reported_redemptions_m || []).some(v => v != null);
const hasReinvest = c => (c.reported_reinvestments_m || []).some(v => v != null);

const fundOf = t => D.funds.find(f => f.ticker === t);
// Segments long enough to be a real reporting-currency era. The payload keeps
// the short ones so the count stays visible, but they are not plottable.
// A brand-new fund can have only short ones; show them rather than nothing.
const segsOf = t => {
  const all = D.series[t] || [];
  const long = all.filter(s => s.reviewed || s.cols.asof.length >= D.min_segment_months);
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
    meta(); stats(); initMatrix(); overviewTable(); initPickers(); initViews();
    initWatchlist(); renderFund(); renderClasses(); renderStatements();
    const requestedView = location.hash.slice(1);
    if (["tracker", "overview", "watchlist", "fund", "classes", "statements"].includes(requestedView)) {
      showView(requestedView);
    }
  })
  .catch(e => {
    document.body.insertAdjacentHTML("afterbegin",
      `<div class="error-msg">Failed to load evergreen.json: ${esc(e.message)}. ` +
      `Run <code>python3 scripts/37_build_evergreen_site.py</code> to build it.</div>`);
  });

function meta() {
  const el = document.getElementById("refresh-meta");
  if (el) el.textContent = `Monthly filing scrape through ${month(D.data_through)}`
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
    `${flows.toLocaleString()} with a flow estimate`
    + (wh ? ` · ${wh} withheld` : "");
  document.getElementById("st-earliest").textContent =
    month(D.funds.reduce((a, f) => !a || f.first_month < a ? f.first_month : a, null));
  document.getElementById("st-latest").textContent = month(D.data_through);
  document.getElementById("st-latest-sub").textContent =
    `${latest} of ${D.funds.length} funds current`;
}

function managerKey(f) {
  const source = (f.source || "").toLowerCase();
  if (source.includes("partners group")) return "partners_group";
  if (source.includes("hamilton lane")) return "hamilton_lane";
  if (source.includes("carlyle")) return "carlyle";
  if (source.includes("stepstone")) return "stepstone";
  if (source.startsWith("ares ")) return "ares";
  if (source.startsWith("blackstone ")) return "blackstone";
  if (source.startsWith("kkr ")) return "kkr";
  return source || "other";
}

function matrixMonths(limit) {
  const all = [...new Set(Object.values(D.series || {}).flatMap(segments =>
    segments.flatMap(seg => seg.cols.asof || [])))].sort();
  return limit === "all" ? all : all.slice(-Number(limit));
}

function matrixCell(value, metric, seg, i, src) {
  const c = seg.cols, ccy = seg.ccy;
  let formatted = "·", valueClass = "";
  if (metric === "size") formatted = money(value, ccy);
  else if (metric === "ret" || metric === "calculated_nav_change_pct") { formatted = pctSigned(value); valueClass = cls(value); }
  else if (metric === "flow") { formatted = moneySigned(value, ccy); valueClass = cls(value); }
  else if (metric === "flow_pct") { formatted = pctSigned(value); valueClass = cls(value); }
  else if (metric === "navps") formatted = value == null ? "·" : sym(ccy) + num(value);
  else if (metric === "reported_subscriptions_m") formatted = money(value, ccy);
  else if (metric === "reported_redemptions_m") {
    formatted = value == null ? "·" : value === 0 ? money(0, ccy) : moneySigned(-value, ccy);
    valueClass = value ? "neg" : "";
  }
  // Stated flows carry their own source, whatever the month's tier (a
  // photographed month keeps its NAV chain and gains the filing's flows).
  const stated = metric.startsWith("reported_");
  const provisional = !stated && (c.review_status || [])[i] === "provisional";
  const scraped = (c.review_status || [])[i] === "scraped";
  const status = stated ? "Stated in the manager's publication or SEC filing"
    : provisional ? "Provisional workbook"
    : scraped ? "Auto-read from the manager's published report" : "Source-reviewed / published";
  const effective = (c.subscriptions_effective || [])[i];
  const note = metric === "calculated_nav_change_pct"
    ? "Calculated from consecutive published NAV/share; not a reported total return and not used for implied flows"
    : metric === "size" && value != null && (c.nav_measure || [])[i] === "aum"
      ? aumNote((c.nav_precision_m || [])[i], ccy)
    : metric === "flow" ? (c.flow_note || [])[i]
    : metric === "reported_subscriptions_m" && value != null
      ? `${effective ? `effective ${effective} · ` : ""}${SUBS_NOTE}`
      : metric === "reported_redemptions_m" && value != null ? REDEEM_NOTE : "";
  const srcNote = src && i === c.asof.length - 1 ? ` · ${srcTitle(src)}` : "";
  const title = `${c.asof[i]} · ${status}${note ? ` · ${note}` : ""}${(c.data_note || [])[i] ? ` · ${c.data_note[i]}` : ""}${srcNote}`;
  const classes = [valueClass, provisional ? "matrix-provisional" : "", value == null ? "matrix-missing" : ""]
    .filter(Boolean).join(" ");
  return `<td class="${classes}" title="${esc(title)}">${formatted}</td>`;
}

function initMatrix() {
  const managerPick = document.getElementById("matrix-manager");
  const managers = [...new Set(D.funds.map(managerKey))].sort((a, b) =>
    managerName(a).localeCompare(managerName(b)));
  for (const key of managers) {
    const opt = document.createElement("option");
    opt.value = key; opt.textContent = managerName(key); managerPick.append(opt);
  }
  managerPick.addEventListener("change", renderMatrix);
  document.getElementById("matrix-range").addEventListener("change", renderMatrix);
  document.getElementById("matrix-search").addEventListener("input", renderMatrix);
  document.getElementById("matrix-latest").addEventListener("click", scrollMatrixLatest);
  renderMatrix();
}

function scrollMatrixLatest() {
  const wrap = document.getElementById("matrix-wrap");
  wrap.scrollLeft = wrap.scrollWidth;
}

function renderMatrix() {
  const manager = document.getElementById("matrix-manager").value;
  const search = document.getElementById("matrix-search").value.trim().toLowerCase();
  const months = matrixMonths(document.getElementById("matrix-range").value);
  const blocks = D.funds.flatMap(f => segsOf(f.ticker).map(seg => ({f, seg, manager: managerKey(f)})))
    .filter(x => (!manager || x.manager === manager)
      && `${x.f.ticker} ${x.f.legal_name || ""} ${managerName(x.manager)}`.toLowerCase().includes(search))
    .sort((a, b) => managerName(a.manager).localeCompare(managerName(b.manager))
      || a.f.ticker.localeCompare(b.f.ticker) || a.seg.ccy.localeCompare(b.seg.ccy));
  const head = `<thead><tr><th class="matrix-fund-head">Fund</th><th class="matrix-metric-head">KPI</th>`
    + months.map(m => `<th class="matrix-date" title="${esc(m)}">${month(m)}</th>`).join("") + "</tr></thead>";
  let body = "<tbody>";
  for (const {f, seg, manager: managerKeyValue} of blocks) {
    const byMonth = new Map((seg.cols.asof || []).map((asof, i) => [asof, i]));
    const src = isLatestSeg(f, seg) ? f.latest_source : null;
    // The asterisk covers both sizes not verified as total net assets: a
    // workbook figure that may be AUM, and the AUM a fact card prints.
    const sizeLabel = (seg.cols.nav_measure || []).some(x => x === "unverified_nav_or_aum" || x === "aum")
      ? "NAV / AUM*" : "Fund NAV";
    const metrics = [
      ["size", sizeLabel], ["ret", "Performance"], ["flow", "Implied flow"],
      ["flow_pct", "Flow / NAV"], ["navps", "NAV / share"],
      ...((seg.cols.calculated_nav_change_pct || []).some(v => v != null)
        ? [["calculated_nav_change_pct", "NAV change (calc.)", "Not a sponsor-reported total return"]] : []),
      ...(hasSubs(seg.cols) ? [["reported_subscriptions_m", "Gross sales", SUBS_NOTE]] : []),
      ...(hasRedeem(seg.cols) ? [["reported_redemptions_m", "Redemptions", REDEEM_NOTE]] : []),
    ];
    metrics.forEach(([field, label, tip], rowIndex) => {
      body += `<tr${rowIndex === 0 ? ' class="matrix-fund-start"' : ""}>`;
      if (rowIndex === 0) {
        const provisional = f.n_provisional_months
          ? `<span class="badge provisional">${f.n_provisional_months} provisional</span>` : "";
        const scraped = f.n_scraped_months
          ? `<span class="badge scraped">${f.n_scraped_months} auto-read</span>` : "";
        body += `<td class="matrix-fund-cell" rowspan="${metrics.length}">`
          + `<span class="matrix-manager">${esc(managerName(managerKeyValue))}</span>`
          + `<b>${esc(f.ticker)}</b> · ${esc(seg.ccy)}${scraped}${provisional}`
          + `<span class="matrix-fund-name">${esc(f.legal_name || "")}</span>`
          + (src ? `<span class="matrix-source" title="${esc(srcTitle(src))}">${srcLine(src)}</span>` : "")
          + `</td>`;
      }
      body += `<th class="matrix-metric-cell" scope="row"${tip ? ` title="${esc(tip)}"` : ""}>${label}</th>`;
      for (const m of months) {
        const i = byMonth.get(m);
        body += i == null ? '<td class="matrix-missing" title="No observation">·</td>'
          : matrixCell((seg.cols[field] || [])[i], field, seg, i, src);
      }
      body += "</tr>";
    });
  }
  body += blocks.length ? "</tbody>" : `<tr><td colspan="${months.length + 2}">No funds match these filters.</td></tr></tbody>`;
  document.getElementById("tbl-matrix").innerHTML = head + body;
  document.getElementById("matrix-summary").textContent = blocks.length
    ? `${blocks.length} fund / currency series · ${months.length} sequential month-ends · oldest to newest`
    : "No fund series match these filters.";
  requestAnimationFrame(scrollMatrixLatest);
}

function overviewTable() {
  const head = ["Fund", "Strategy", "Ccy", "Latest", "NAV / share",
                "Fund size", "Flow est. (mo)", "Flow est. (TTM)", "Return (TTM)",
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
    const provisional = f.n_provisional_months
      ? `<span class="badge provisional" title="User-supplied workbook history. Values and calculations were transcribed and reconciled, but the underlying manager publication has not yet been independently verified.">${f.n_provisional_months} provisional</span>`
      : "";
    const scraped = f.n_scraped_months
      ? `<span class="badge scraped" title="Read automatically from the manager's own monthly publication. Each value links to the document it came from.">${f.n_scraped_months} auto-read</span>`
      : "";
    h += "<tr>"
      + `<td><a href="#" data-goto="${esc(f.ticker)}">${esc(f.ticker)}</a>${withheld}${scraped}${provisional}<div class="sub" `
      + `style="font-size:11px;color:var(--text-faint)">${esc(f.legal_name || "")}</div></td>`
      + `<td style="text-align:left">${esc(f.strategy || "·")}</td>`
      + `<td style="text-align:left">${f.ccy || "·"}</td>`
      + `<td${f.latest_source ? ` title="${esc(srcTitle(f.latest_source))}"` : ""}>${month(f.latest_month)}`
      + (f.latest_source && f.latest_source.date
        ? `<div class="src-line">${esc(f.latest_source.short || f.latest_source.label)} · ${esc(srcDate(f.latest_source))}</div>`
        : "")
      + `</td>`
      + `<td${f.latest_navps_month && f.latest_navps_month !== f.latest_month
          ? ` title="NAV per share as of ${esc(f.latest_navps_month)}"` : ""}>`
      + `${f.latest_navps == null ? "·" : sym(f.ccy) + num(f.latest_navps)}</td>`
      + `<td>${money(f.latest_size_m, f.ccy)}${sizeMark(f)}</td>`
      + `<td class="${cls(f.latest_flow_m)}">${moneySigned(f.latest_flow_m, f.ccy)}`
      + (f.latest_subscriptions_m == null ? ""
        : `<div class="sub" style="font-size:11px;color:var(--text-faint)" title="${esc(SUBS_NOTE)}">`
          + `gross subs ${money(f.latest_subscriptions_m, f.ccy)}`
          + (f.latest_redemptions_m == null ? "" : ` · redemptions ${money(f.latest_redemptions_m, f.ccy)}`)
          + ` (${month(f.latest_subscriptions_month)})</div>`)
      + `</td>`
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
    `TTM figures require twelve consecutive calendar months with all inputs present. `
    + `Flow estimate (TTM) sums monthly estimates; Return (TTM) compounds monthly returns. Both use the fund's `
    + `current reporting currency. Provisional rows reproduce user-supplied workbook history; `
    + `they are visibly labeled and remain separate from source-reviewed observations.`
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
    `<option value="${esc(f.ticker)}">${esc(f.ticker)} — ${esc(f.legal_name || "")}</option>`).join("");
  const fp = document.getElementById("fund-pick");
  const cp = document.getElementById("cls-fund-pick");
  fp.innerHTML = opts;
  // Largest fund first: it is the one most likely to be looked at.
  FUND = [...D.funds].sort((a, b) =>
    (b.latest_size_m || 0) - (a.latest_size_m || 0))[0].ticker;
  fp.value = FUND;
  cp.innerHTML = D.funds
    .filter(f => (D.pershare[f.ticker] || []).length)
    .map(f => `<option value="${esc(f.ticker)}">${esc(f.ticker)} — ${esc(f.legal_name || "")}</option>`)
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
  const hasWorkbookFlow = (c.flow_status || []).some(x => x === "provisional_workbook_flow");

  document.getElementById("fd-title").textContent =
    `${f.ticker} — ${f.legal_name || ""}`;
  const withheldNote = f.n_withheld_months
    ? ` · ${f.n_withheld_months} factsheet month`
      + `${f.n_withheld_months > 1 ? "s" : ""} withheld as unvalidated`
    : "";
  const provisionalNote = f.n_provisional_months
    ? ` · ${f.n_provisional_months} provisional workbook month${f.n_provisional_months > 1 ? "s" : ""}`
    : "";
  document.getElementById("fd-sub").textContent =
    `${f.strategy || ""} · ${f.sponsor || ""}`
    + `${f.source ? ` · ${f.source}` : ""}`
    + ` · reporting in ${ccy}`
    + `${seg.lead_class ? ` (lead class ${seg.lead_class})` : ""}`
    + ` · ${c.asof.length} months, ${month(c.asof[0])} to `
    + `${month(c.asof[c.asof.length - 1])}${withheldNote}${provisionalNote}`;

  const ls = f.latest_source;
  document.getElementById("fd-source").innerHTML = !ls ? ""
    : `Latest month: ${srcLine(ls, "label")}`
      + (ls.published ? ` · publisher's file dated ${esc(longDay(ls.published))}` : "")
      + (ls.detail ? `<span class="src-detail"> (${esc(ls.detail)})</span>` : "")
      + (isLatestSeg(f, seg) ? "" : ` <span class="src-detail">— in the ${esc(f.ccy)} series</span>`);

  drawChart("flowChart", {
    labels: c.asof.map(month),
    datasets: [
      {type: "bar", label: `${hasWorkbookFlow ? "Provisional / estimated flow" : "Estimated NAV residual"} (${ccy}m)`, yAxisID: "y2",
       data: c.flow,
       backgroundColor: c.flow.map(v => (v || 0) >= 0
         ? "rgba(11,107,50,0.45)" : "rgba(176,45,33,0.45)")},
      ...(hasSubs(c) ? [{type: "bar", label: `Gross subscriptions, reported (${ccy}m)`, yAxisID: "y2",
        data: c.reported_subscriptions_m, backgroundColor: "rgba(47,111,174,0.55)"}] : []),
      ...(hasRedeem(c) ? [{type: "bar", label: `Redemptions, reported (${ccy}m)`, yAxisID: "y2",
        data: c.reported_redemptions_m.map(v => v == null ? null : -v),
        backgroundColor: "rgba(214,110,40,0.55)"}] : []),
      {type: "line", label: `Fund size (${ccy}m)`, yAxisID: "y1",
       data: c.size, borderColor: "#1f5fa6",
       backgroundColor: "rgba(31,95,166,0.10)",
       borderWidth: 1.8, tension: 0.15, fill: true, spanGaps: true,
       pointRadius: 0},
    ],
  }, {
    // A fund that publishes no size (AESIF) gets no empty size axis.
    y1: {position: "left", display: c.size.some(v => v != null),
         title: {display: true, text: `Fund size (${ccy}m)`}},
    y2: {position: "right", title: {display: true, text: `Flow (${ccy}m)`},
         grid: {drawOnChartArea: false}},
  });
  document.getElementById("flow-subs-hint").hidden = !(hasSubs(c) || hasRedeem(c));

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
  if (typeof Chart === "undefined") {
    const canvas = document.getElementById(id);
    if (!canvas.parentElement.querySelector(".chart-hint")) {
      const note = document.createElement("p"); note.className = "chart-hint";
      note.textContent = "Chart library unavailable. All observations remain available in the table below.";
      canvas.parentElement.prepend(note);
    }
    return;
  }
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
  const hasWorkbookFlow = (c.flow_status || []).some(x => x === "provisional_workbook_flow");
  const head = ["Month", "NAV / share", "Return", "Fund size", "Size change",
                "Performance effect", hasWorkbookFlow ? "Flow estimate" : "NAV residual (est.)", "% of NAV"];
  const subs = hasSubs(c), reinvest = hasReinvest(c), redeem = hasRedeem(c);
  if (subs) head.push(`<span title="${esc(SUBS_NOTE)}">Gross subscriptions (reported)</span>`);
  if (reinvest) head.push("Reinvested distributions (reported)");
  if (redeem) head.push(`<span title="${esc(REDEEM_NOTE)}">Redemptions (reported)</span>`);
  const reviewed = (c.flow_status || []).some(Boolean);
  if (reviewed) head.push("External capital flow (est.)", "Sources & qualification");
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
      + (subs ? `<td title="${esc((c.subscriptions_effective || [])[i]
          ? `effective ${c.subscriptions_effective[i]}` : "")}">`
        + `${money((c.reported_subscriptions_m || [])[i], ccy)}</td>` : "")
      + (reinvest ? `<td>${money((c.reported_reinvestments_m || [])[i], ccy)}</td>` : "")
      + (redeem ? `<td class="${(c.reported_redemptions_m || [])[i] ? "neg" : "zero"}">`
        + `${(c.reported_redemptions_m || [])[i] == null ? "·"
          : c.reported_redemptions_m[i] === 0 ? money(0, ccy)
          : moneySigned(-c.reported_redemptions_m[i], ccy)}</td>` : "")
      + (reviewed ? `<td>${moneySigned((c.capital_flow_m || [])[i], ccy)}</td>`
        + `<td class="review-cell">${link((c.source_url || [])[i], "NAV source")}`
        + ((c.return_source_url || [])[i] ? ` · ${link(c.return_source_url[i], "Return source")}` : "")
        + ((c.flows_source_url || [])[i]
          ? ` · ${link(c.flows_source_url[i], "Flows source")}` : "")
        + ((c.review_status || [])[i] === "provisional" ? ` <span class="badge provisional">provisional workbook</span>` : "")
        + ((c.review_status || [])[i] === "scraped" ? ` <span class="badge scraped">auto-read</span>` : "")
        + `<div>${esc((c.flow_note || [])[i] || "No estimate")}</div></td>` : "")
      + "</tr>";
  }
  document.getElementById("tbl-months").innerHTML = h;
}

function initWatchlist() {
  const pick = document.getElementById("watch-manager");
  const funds = (D.report_watchlist || {}).funds || [];
  for (const key of [...new Set(funds.map(f => f.manager))].sort()) {
    const opt = document.createElement("option"); opt.value = key;
    opt.textContent = managerName(key); pick.append(opt);
  }
  pick.addEventListener("change", renderWatchlist);
  document.getElementById("watch-search").addEventListener("input", renderWatchlist);
  renderWatchlist();
}

function renderWatchlist() {
  const coverage = D.report_watchlist || {}, all = coverage.funds || [];
  const manager = document.getElementById("watch-manager").value;
  const search = document.getElementById("watch-search").value.trim().toLowerCase();
  const funds = all.filter(f => (!manager || f.manager === manager)
    && `${f.ticker} ${f.name} ${managerName(f.manager)}`.toLowerCase().includes(search));
  const noun = (n, one, many = one + "s") => `${n} ${n === 1 ? one : many}`;
  document.getElementById("watch-summary").textContent = all.length
    ? `${funds.length} of ${all.length} watchlist entries · ${noun(coverage.n_approved || 0, "source-reviewed observation")} · `
      + `${noun(coverage.n_provisional || 0, "provisional workbook observation")} · `
      + `${noun(coverage.n_pending || 0, "observation")} pending review · ${noun(coverage.n_residuals || 0, "estimated NAV residual")} · `
      + `${noun(coverage.n_capital_flow_estimates || 0, "estimated external capital flow")}. `
      + "Blank estimates mean inputs are missing or incompatible—not zero flows."
    : "Watchlist not built yet. Run scripts/38_manager_monthly.py build, then scripts/37_build_evergreen_site.py.";
  let html = "<tr><th>Manager / fund</th><th>Coverage & blockers</th><th>Report observed</th>"
    + "<th>Reviewed data</th><th>Official sources / checks</th></tr>";
  for (const f of funds) {
    const issues = [...new Set((coverage.issues || []).filter(i => i.ticker === f.ticker).map(i => i.reason))];
    const labels = {returns_only: "Returns captured; fund NAV needed", nav_residual_available: "Estimated NAV residual available", not_verified: "Inputs not yet verified",
      nav_anchor_only: "NAV anchor captured", nav_basis_mismatch: "NAV bases need reconciliation",
      manual_access: "Authorized manual access needed", missing_nav_or_return: "NAV / return inputs missing",
      aum_not_nav: "Published size is AUM, not verified NAV", scope_watchlist: "Fund scope under review"};
    const notes = [labels[f.data_status] || f.data_status, (f.tracking_status || "").startsWith("legacy") ? "Legacy / runoff" : null,
      ...(Array.isArray(f.flow_blockers) ? f.flow_blockers : [f.flow_blockers]),
      ...(Array.isArray(f.notes) ? f.notes : [f.notes]), ...issues].filter(Boolean);
    const sourceItems = (f.sources || []).map(s => {
      const collected = (f.collection?.sources || []).find(c => c.url === s.url);
      const check = collected ? {...collected, checked_at: f.collection.checked_at} : (s.check || {});
      const status = check.status || (s.access && s.access !== "public" ? "manual_access" : "not_checked");
      const names = {manual_access: "Manual / authorized access", manual_browser: "Browser archive check required", not_checked: "Not fetched", error: "Fetch failed",
        review_needed: "Review needed", unchanged: "Hash unchanged", read: "Read successfully",
        not_a_numeric_source: "See linked fact card for metrics"};
      return `${link(s.url, s.label || "Official source")}<div class="chart-hint">${esc(names[status] || status)}`
        + (check.checked_at ? ` · ${esc(check.checked_at.slice(0, 10))}` : "")
        + (check.note ? `<br>${esc(check.note)}` : "") + "</div>";
    });
    const collection = f.collection;
    const health = collection ? `<div class="chart-hint"><b>Monthly collector: ${esc(collection.status)}</b>`
      + ` · checked ${esc((collection.checked_at || "").slice(0,10))}`
      + ` · data through ${esc(collection.latest_month || "unavailable")}`
      + Object.entries(collection.field_coverage || {}).map(([k,v]) => `<br>${esc(k)}: ${esc(v || "not reported")}`).join("")
      + (collection.limitations || []).map(x => `<br>${esc(x)}`).join("")
      + (collection.quarantined_fields?.length ? `<br>${collection.quarantined_fields.length} non-reference-class issue(s) quarantined for review; excluded from the monthly matrix` : "")
      + (collection.calculated_performance_available ? "<br>Calculated NAV change available; reported total return not supplied" : "")
      + (collection.issues || []).map(x => `<br>${esc(x)}`).join("") + "</div>" : "";
    const sources = health + sourceItems.slice(0, 3).join("") + (sourceItems.length > 3
      ? `<details><summary>${sourceItems.length - 3} more source links</summary>${sourceItems.slice(3).join("")}</details>` : "");
    html += `<tr><td><div>${esc(managerName(f.manager))}</div><b>${esc(f.ticker)}</b>`
      + `<div class="review-cell">${esc(f.name)}</div><div class="chart-hint">${esc(f.market || "")}</div></td>`
      + `<td class="review-cell">${notes.length ? [...new Set(notes)].map(esc).join("<br>") : "Awaiting source review"}</td>`
      + `<td>${esc(month(f.latest_report_month))}</td><td>${esc(month(f.latest_published_month || f.latest_reviewed_month))}`
      + `<div class="chart-hint">${f.n_reviewed || 0} reviewed`
      + `${f.n_provisional ? ` · ${f.n_provisional} provisional` : ""}`
      + `${f.n_pending ? ` · ${f.n_pending} pending` : ""}</div></td>`
      + `<td class="review-cell">${sources || "Source discovery needed"}</td></tr>`;
  }
  if (!funds.length) html += '<tr><td colspan="5">No watchlist entries match these filters.</td></tr>';
  document.getElementById("tbl-watchlist").innerHTML = html;
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
  location.hash = name === "tracker" ? "" : name;
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
