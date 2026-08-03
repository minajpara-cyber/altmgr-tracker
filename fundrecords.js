/* Fund Records page — wrapped in an IIFE: app.js owns global
   fmtM/fmtPct, and top-level const redeclaration is a SyntaxError that
   silently kills the whole script. */
(() => {
const MGRC = {BX:"#16803c", KKR:"#b45309", CG:"#1d4ed8", APO:"#7c3aed",
              ARES:"#0e7490", OWL:"#be185d", TPG:"#57534e",
              BAM:"#a16207", EQT:"#3f6212", CVC:"#701a75"};
const SYM = {USD:"$", EUR:"€", JPY:"¥", GBP:"£", CAD:"C$"};
let D = null, charts = {};

const fmtM = (v, ccy) => v == null ? "" :
  (SYM[ccy] || "$") + v.toLocaleString("en-US");
const fmtPct = v => v == null ? "" : v.toFixed(1) + "%";
const fmtX = v => v == null ? "" : v.toFixed(2) + "x";

if (typeof paintRefreshDate === "function") paintRefreshDate();
fetch("./fundrecords.json", {cache: "no-store"}).then(r => r.json()).then(d => {
  D = d;
  stats(); filters(); league(); watch(); trajectory(); peerBench(); agingNav(); rollups();
  initTables(); initViews();
});

function matrixTable(el, head, rows) {
  let h = '<table style="border-collapse:collapse;font-size:12px;' +
          'font-variant-numeric:tabular-nums;white-space:nowrap"><tr>' +
    head.map((c, i) => '<th style="text-align:' + (i ? "right" : "left") +
      ';padding:3px 9px;border-bottom:1px solid #d1d5db">' + c +
      "</th>").join("") + "</tr>";
  for (const r of rows) {
    h += "<tr>" + r.map((c, i) => '<td style="text-align:' +
      (i ? "right" : "left") +
      ';padding:2px 9px;border-bottom:1px solid #f3f4f6">' +
      (c == null ? "·" : c) + "</td>").join("") + "</tr>";
  }
  document.getElementById(el).innerHTML = h + "</table>";
}

function agingTables() {
  const scope = document.getElementById("ag-scope").value;
  const a = D.aging[scope];
  const rows = [], csv = [];
  D.periods.forEach((p, i) => {
    if (a.young[i] == null) return;
    const tot = (a.young[i] + a.y6_9[i] + a.y10p[i]).toFixed(0);
    rows.push([p, a.young[i], a.y6_9[i], a.y10p[i], tot, a.unk[i]]);
    csv.push({period: p, under_6y_bn: a.young[i], y6_9_bn: a.y6_9[i],
              y10plus_bn: a.y10p[i], total_known_bn: tot,
              no_vintage_bn: a.unk[i]});
  });
  matrixTable("tbl-aging",
    ["NAV by age ($bn)", "Under 6y", "6–9y", "10y+", "Total known",
     "No vintage"], rows);
  window.__agingCsv = csv;

  const s10 = D.aging.share10_by_mgr;
  const mgrs = Object.keys(s10);
  const rows2 = D.periods.map((p, i) =>
    [p, ...mgrs.map(m => s10[m][i])])
    .filter(r => r.slice(1).some(v => v != null));
  matrixTable("tbl-aging10",
    ["10y+ share (%)", ...mgrs.map(m => D.mgr_names[m] || m)], rows2);
}

let peerTable = null;
function peerTables(pool, met) {
  const data = pool.map(({fd, size}) => {
    const lg = D.league.find(r => fkey(r) === fkey(fd)) || {};
    return {mgr: D.mgr_names[fd.m] || fd.m, name: fd.name, vint: fd.vint,
      ccy: fd.ccy, committed: lg.committed, unrealized: lg.unrealized,
      dpi: lg.dpi, moic: lg.moic, girr: lg.girr, nirr: lg.nirr,
      drift4: lg.drift4,
      excluded: pbExcl.has(fkey(fd)) ? "yes" : ""};
  });
  const cols = [
    {title: "Mgr", field: "mgr", width: 86},
    {title: "Fund", field: "name", minWidth: 200},
    {title: "Vint", field: "vint", width: 60, hozAlign: "center"},
    {title: "Committed (m)", field: "committed", sorter: "number",
     hozAlign: "right", width: 112,
     formatter: c => fmtM(c.getValue(), c.getData().ccy)},
    {title: "Unrealized (m)", field: "unrealized", sorter: "number",
     hozAlign: "right", width: 112,
     formatter: c => fmtM(c.getValue(), c.getData().ccy)},
    {title: "DPI", field: "dpi", sorter: "number", hozAlign: "right",
     width: 66, formatter: c => c.getValue() == null ? "" :
       c.getValue().toFixed(2)},
    {title: "MOIC", field: "moic", sorter: "number", hozAlign: "right",
     width: 70, formatter: c => fmtX(c.getValue())},
    {title: "Gross IRR", field: "girr", sorter: "number",
     hozAlign: "right", width: 88, formatter: c => fmtPct(c.getValue())},
    {title: "Net IRR", field: "nirr", sorter: "number", hozAlign: "right",
     width: 82, formatter: c => fmtPct(c.getValue())},
    {title: "Δ4q", field: "drift4", sorter: "number", hozAlign: "right",
     width: 66},
    {title: "Excl.", field: "excluded", width: 56, hozAlign: "center"},
  ];
  if (peerTable) {
    peerTable.setData(data);
  } else {
    peerTable = new Tabulator("#tbl-peerset", {data,
      layout: "fitColumns", height: "420px",
      initialSort: [{column: "committed", dir: "desc"}], columns: cols});
  }
  window.__peerCsv = data;
}

function mgrTable() {
  const key = document.getElementById("mg-met").value;
  const src = ("below8 rrate wdrift".includes(key))
    ? Object.fromEntries(Object.keys(D.score)
        .map(m => [m, D.score[m][key]]))
    : Object.fromEntries(Object.keys(D.rollups)
        .map(m => [m, D.rollups[m][key]]).filter(([, v]) => v));
  const mgrs = Object.keys(src)
    .filter(m => (src[m] || []).some(v => v != null && v !== 0));
  const rows = D.periods.map((p, i) => [p, ...mgrs.map(m => src[m][i])])
    .filter(r => r.slice(1).some(v => v != null));
  matrixTable("tbl-mgr",
    [document.getElementById("mg-met").selectedOptions[0].text,
     ...mgrs.map(m => D.mgr_names[m] || m)], rows);
  window.__mgrCsv = rows.map(r => Object.fromEntries(
    [["period", r[0]], ...mgrs.map((m, j) => [m, r[j + 1]])]));
}

function initTables() {
  agingTables();
  document.getElementById("ag-scope")
    .addEventListener("change", agingTables);
  mgrTable();
  document.getElementById("mg-met").addEventListener("change", mgrTable);
  document.getElementById("dl-aging").addEventListener("click", () =>
    downloadCsv("aging_nav.csv", window.__agingCsv || []));
  document.getElementById("dl-peers").addEventListener("click", () =>
    downloadCsv("peer_set.csv", window.__peerCsv || []));
  document.getElementById("dl-mgr").addEventListener("click", () =>
    downloadCsv("manager_trends.csv", window.__mgrCsv || []));
}

function initViews() {
  const pills = document.querySelectorAll("#frpills button");
  const show = v => {
    pills.forEach(b => b.classList.toggle("active", b.dataset.view === v));
    document.querySelectorAll(".frview").forEach(s =>
      s.classList.toggle("active", s.dataset.view === v));
    history.replaceState(null, "", "#" + v);
    // charts created inside hidden views render 0x0 — fix on reveal
    setTimeout(() => {
      document.querySelectorAll(`.frview[data-view="${v}"] canvas`)
        .forEach(cv => { const ch = Chart.getChart(cv); ch && ch.resize(); });
      if (v === "funds") {
        leagueTable && leagueTable.redraw(true);
        watchTable && watchTable.redraw(true);
      }
      if (v === "peers" && peerTable) peerTable.redraw(true);
    }, 30);
  };
  pills.forEach(b => b.addEventListener("click", () => show(b.dataset.view)));
  const h = location.hash.replace("#", "");
  if (["funds", "peers", "managers"].includes(h)) show(h);
}

function stats() {
  const lg = D.league;
  document.getElementById("st-funds").textContent = lg.length;
  document.getElementById("st-funds-sub").textContent =
    D.managers.length + " managers · " + D.periods.length + " quarters";
  let unrl = 0;
  for (const m of D.managers) {
    const a = D.rollups[m].unrealized;
    unrl += a[a.length - 1] || a[a.length - 2] || 0;
  }
  document.getElementById("st-unrl").textContent =
    "$" + Math.round(unrl) + "bn";
  const irrs = lg.map(r => r.nirr).filter(v => v != null).sort((a,b)=>a-b);
  document.getElementById("st-irr").textContent =
    fmtPct(irrs[Math.floor(irrs.length / 2)]);
  document.getElementById("st-irr-sub").textContent =
    irrs.length + " funds reporting net IRR";
  const w = D.watch[0];
  if (w) {
    document.getElementById("st-drift").textContent =
      w.drift4.toFixed(1) + "pp";
    document.getElementById("st-drift-sub").textContent =
      w.name + " (" + D.mgr_names[w.m] + ")";
  }
}

function filters() {
  const mgr = document.getElementById("f-mgr");
  D.managers.forEach(m => mgr.add(new Option(D.mgr_names[m] || m, m)));
  const segs = [...new Set(D.league.map(r => r.seg).filter(Boolean))].sort();
  const seg = document.getElementById("f-seg");
  segs.forEach(s => seg.add(new Option(s, s)));
  const cohs = [...new Set(D.league.map(r => r.cohort).filter(Boolean))].sort();
  const coh = document.getElementById("f-coh");
  cohs.forEach(c => coh.add(new Option(c, c)));
  const bkt = document.getElementById("f-bkt");
  (D.buckets || []).forEach(b => bkt.add(new Option(b, b)));
  ["f-mgr", "f-seg", "f-coh", "f-bkt"].forEach(id =>
    document.getElementById(id).addEventListener("change", applyFilters));
  document.getElementById("f-q").addEventListener("input", applyFilters);
}

let leagueTable = null, watchTable = null;
function applyFilters() {
  const m = document.getElementById("f-mgr").value;
  const s = document.getElementById("f-seg").value;
  const c = document.getElementById("f-coh").value;
  const q = document.getElementById("f-q").value.toLowerCase();
  const b = document.getElementById("f-bkt").value;
  leagueTable.setFilter(row => (!m || row.m === m) && (!s || row.seg === s)
    && (!c || row.cohort === c) && (!b || row.bkt === b)
    && (!q || row.name.toLowerCase().includes(q)));
}

function league() {
  leagueTable = new Tabulator("#tbl-frleague", {
    data: D.league, layout: "fitColumns", height: "560px",
    initialSort: [{column: "usd_unrealized", dir: "desc"}],
    columns: [
      {title: "Mgr", field: "m", width: 66,
       formatter: c => D.mgr_names[c.getValue()] || c.getValue()},
      {title: "Fund", field: "name", minWidth: 210,
       formatter: c => c.getValue() + (c.getData().plan
         ? ' <span class="badge">' + c.getData().plan.toLowerCase() +
           (c.getData().pctinv ? " · ~" + c.getData().pctinv + "% inv" : "")
           + "</span>" : "")},
      {title: "Segment", field: "seg", width: 150},
      {title: "Vint", field: "vint", width: 62, hozAlign: "center"},
      {title: "Committed (m)", field: "usd_committed", sorter: "number", hozAlign: "right",
       width: 118, formatter: c => fmtM(c.getData().committed, c.getData().ccy)},
      {title: "Unrealized (m)", field: "usd_unrealized", sorter: "number", hozAlign: "right",
       width: 118, formatter: c => fmtM(c.getData().unrealized, c.getData().ccy)},
      {title: "Total value (m)", field: "usd_total", sorter: "number", hozAlign: "right",
       width: 118, formatter: c => fmtM(c.getData().total, c.getData().ccy)},
      {title: "MOIC*", field: "moic", sorter: "number", hozAlign: "right", width: 76,
       formatter: c => fmtX(c.getValue())},
      {title: "DPI", field: "dpi", sorter: "number", hozAlign: "right", width: 70,
       formatter: c => c.getValue() == null ? "" : c.getValue().toFixed(2)},
      {title: "Net IRR", field: "nirr", sorter: "number", hozAlign: "right", width: 84,
       formatter: c => {
         const v = c.getValue();
         if (v != null && v < 8) c.getElement().style.color = "#b45309";
         return fmtPct(v);
       }},
      {title: "Δ4q", field: "drift4", sorter: "number", hozAlign: "right", width: 76,
       formatter: c => {
         const v = c.getValue();
         if (v == null) return "";
         c.getElement().classList.add(v <= -3 ? "drift-bad"
           : (v >= 3 ? "drift-good" : "mono"));
         return (v > 0 ? "+" : "") + v.toFixed(1);
       }},
    ],
  });
  leagueTable.on("rowClick", (e, row) => drill(row.getData()));
}

function watch() {
  watchTable = new Tabulator("#tbl-frwatch", {
    data: D.watch, layout: "fitColumns", height: "380px",
    columns: [
      {title: "Mgr", field: "m", width: 66,
       formatter: c => D.mgr_names[c.getValue()] || c.getValue()},
      {title: "Fund", field: "name", minWidth: 220},
      {title: "Segment", field: "seg", width: 150},
      {title: "Vint", field: "vint", width: 62, hozAlign: "center"},
      {title: "Unrealized (m)", field: "unrealized", sorter: "number", hozAlign: "right",
       width: 120, formatter: c => fmtM(c.getValue(), c.getData().ccy)},
      {title: "Net IRR", field: "nirr", sorter: "number", hozAlign: "right", width: 88,
       formatter: c => fmtPct(c.getValue())},
      {title: "Δ4q (pp)", field: "drift4", sorter: "number", hozAlign: "right", width: 90,
       formatter: c => { c.getElement().classList.add("drift-bad");
                         return c.getValue().toFixed(1); }},
    ],
  });
}

function drill(row) {
  const fd = D.funds.find(f => f.m === row.m && f.seg === row.seg
                               && f.id === row.id);
  if (!fd) return;
  document.getElementById("drill-title").style.display = "";
  document.getElementById("drill-row").style.display = "";
  document.getElementById("drill-title").innerHTML =
    D.mgr_names[fd.m] + " — " + fd.name +
    '<span class="badge">' + (fd.seg || "") + '</span>' +
    (fd.vint ? '<span class="badge">vintage ' + fd.vint + '</span>' : "") +
    (fd.ccy !== "USD" ? '<span class="badge">' + fd.ccy + '</span>' : "") +
    (fd.plan ? '<span class="badge">' + fd.plan + '</span>' : "");
  const labels = D.periods.slice(fd.p0, fd.p0 + fd.committed.length);

  charts.irr && charts.irr.destroy();
  charts.irr = new Chart(document.getElementById("drillIrr"), {
    type: "line",
    data: {labels, datasets: [
      {label: "Net IRR %", data: fd.nirr, borderColor: MGRC[fd.m],
       backgroundColor: MGRC[fd.m], spanGaps: true, pointRadius: 2},
      {label: "Gross IRR %", data: fd.girr, borderColor: "#9ca3af",
       backgroundColor: "#9ca3af", borderDash: [5, 4], spanGaps: true,
       pointRadius: 0},
    ]},
    options: {animation: false, responsive: true,
      plugins: {legend: {position: "bottom"}},
      scales: {y: {ticks: {callback: v => v + "%"}}}},
  });

  charts.val && charts.val.destroy();
  charts.val = new Chart(document.getElementById("drillVal"), {
    data: {labels, datasets: [
      {type: "bar", label: "Realized", data: fd.realized, stack: "v",
       backgroundColor: MGRC[fd.m] + "55"},
      {type: "bar", label: "Unrealized", data: fd.unrealized, stack: "v",
       backgroundColor: MGRC[fd.m]},
      {type: "line", label: "Committed", data: fd.committed,
       borderColor: "#111827", borderWidth: 1.5, pointRadius: 0,
       stepped: true},
    ]},
    options: {animation: false, responsive: true,
      plugins: {legend: {position: "bottom"}},
      scales: {x: {stacked: true}, y: {stacked: true}}},
  });
  document.getElementById("drill-title")
    .scrollIntoView({behavior: "smooth", block: "center"});
}

function qnum(lab) {  // "Q3 2024" -> absolute quarter number
  const [q, y] = lab.split(" ");
  return parseInt(y) * 4 + parseInt(q[1]) - 1;
}

function trajectory() {
  const mgrs = Object.keys(D.score || {});
  const n = D.periods.length, span = Math.min(8, n);
  const cols = D.periods.slice(n - span);
  let h = '<table style="border-collapse:collapse; font-size:12px;' +
          'font-variant-numeric:tabular-nums"><tr><th style="text-align:' +
          'left;padding:3px 10px 3px 0">Weighted IRR drift (pp/qtr)</th>' +
    cols.map(c => '<th style="padding:3px 8px">' + c + "</th>").join("") +
    "</tr>";
  for (const m of mgrs) {
    const wd = D.score[m].wdrift.slice(n - span);
    if (!wd.some(v => v != null)) continue;
    h += '<tr><td style="padding:3px 10px 3px 0">' +
         (D.mgr_names[m] || m) + "</td>" + wd.map(v => {
      if (v == null) return '<td style="padding:3px 8px;color:#9ca3af;' +
                            'text-align:center">·</td>';
      const a = Math.min(Math.abs(v) / 1.5, 1) * 0.55;
      const bg = v >= 0 ? `rgba(22,128,60,${a})` : `rgba(185,28,28,${a})`;
      return '<td style="padding:3px 8px;text-align:center;background:' +
             bg + '">' + (v > 0 ? "+" : "") + v.toFixed(1) + "</td>";
    }).join("") + "</tr>";
  }
  document.getElementById("drift-heat").innerHTML = h + "</table>";

  const mk = (id, key, fmt) => new Chart(document.getElementById(id), {
    type: "line",
    data: {labels: D.periods, datasets: mgrs
      .filter(m => D.score[m][key].some(v => v != null))
      .map(m => ({label: D.mgr_names[m] || m, data: D.score[m][key],
        borderColor: MGRC[m], backgroundColor: MGRC[m],
        pointRadius: 0, borderWidth: 1.8, spanGaps: false}))},
    options: {animation: false, responsive: true,
      plugins: {legend: {position: "bottom"}},
      scales: {x: {ticks: {maxTicksLimit: 12}},
               y: {ticks: {callback: fmt}}}},
  });
  mk("chBelow8", "below8", v => v + "%");
  mk("chRealPace", "rrate", v => v + "%");
}

let pbExcl = new Set(JSON.parse(localStorage.getItem("fr_excl") || "[]"));
const fkey = f => f.m + "|" + (f.seg || "") + "|" + f.id;
const MET_LABEL = {nirr: "Net IRR", girr: "Gross IRR",
                   dpi: "DPI", moic: "MOIC"};
const MET_PCT = {nirr: true, girr: true, dpi: false, moic: false};

function fundMetricArr(fd, met) {
  if (met === "moic")
    return [fd.tmoic, fd.nmoic, fd.tvpi, fd.gmoic]
      .find(a => a && a.some(v => v != null)) || fd.tmoic;
  return fd[met];
}

function peerBench() {
  const bkt = document.getElementById("pb-bkt");
  (D.buckets || []).forEach(b => bkt.add(new Option(b, b)));
  bkt.value = "Buyout / Corporate PE";
  const coh = document.getElementById("pb-coh");
  [...new Set(D.league.map(r => r.cohort).filter(Boolean))].sort()
    .forEach(c => coh.add(new Option(c, c)));
  ["pb-bkt", "pb-coh", "pb-met"].forEach(id =>
    document.getElementById(id).addEventListener("change", renderPeer));
  document.getElementById("pb-reset").addEventListener("click", () => {
    pbExcl.clear();
    localStorage.setItem("fr_excl", "[]");
    renderPeer();
  });
  renderPeer();
}

function chips(shown, excluded) {
  const box = document.getElementById("pb-chips");
  box.innerHTML = "";
  const mk = (fd, off) => {
    const el = document.createElement("span");
    el.className = "badge";
    el.style.cursor = "pointer";
    el.style.marginLeft = "0";
    el.style.marginRight = "8px";
    if (off) {
      el.style.opacity = "0.45";
      el.style.textDecoration = "line-through";
    } else {
      el.style.borderColor = MGRC[fd.m];
      el.style.color = MGRC[fd.m];
    }
    el.textContent = (D.mgr_names[fd.m] || fd.m) + " · " + fd.name
      + (off ? "  +" : "  ✕");
    el.title = off ? "click to restore" : "click to exclude";
    el.addEventListener("click", () => {
      const k = fkey(fd);
      off ? pbExcl.delete(k) : pbExcl.add(k);
      localStorage.setItem("fr_excl", JSON.stringify([...pbExcl]));
      renderPeer();
    });
    box.appendChild(el);
  };
  shown.forEach(fd => mk(fd, false));
  excluded.forEach(fd => mk(fd, true));
  document.getElementById("pb-reset").style.display =
    pbExcl.size ? "" : "none";
}

function renderPeer() {
  const b = document.getElementById("pb-bkt").value;
  const c = document.getElementById("pb-coh").value;
  const met = document.getElementById("pb-met").value;
  const fmt = MET_PCT[met] ? (v => v + "%") : (v => v + "x");

  const usdc = {};  // rank sizes in USD — ¥/€ raw millions mustn't win
  D.league.forEach(r => { usdc[fkey(r)] = r.usd_committed || 0; });
  const pool = D.funds.filter(fd => fd.bkt === b
      && (!c || fd.cohort === c) && fd.vint
      && (fundMetricArr(fd, met) || []).some(v => v != null))
    .map(fd => {
      const fxr = {JPY: 0.0067, EUR: 1.08, CAD: 0.74, GBP: 1.27}[fd.ccy] || 1;
      return {fd, size: usdc[fkey(fd)]
              ?? Math.max(0, ...fd.committed.filter(v => v)) * fxr};
    })
    .sort((a, z) => z.size - a.size);
  const excluded = pool.filter(({fd}) => pbExcl.has(fkey(fd)))
    .map(({fd}) => fd);
  const cands = pool.filter(({fd}) => !pbExcl.has(fkey(fd))).slice(0, 12);
  chips(cands.map(({fd}) => fd), excluded);
  peerTables(pool, met);

  charts.fran && charts.fran.destroy();
  charts.fran = new Chart(document.getElementById("chFranchise"), {
    type: "line",
    data: {datasets: cands.map(({fd}) => {
      const v0 = parseInt(fd.vint) * 4 + 3;
      const arr = fundMetricArr(fd, met) || [];
      const pts = [];
      arr.forEach((v, i) => {
        if (v != null) pts.push({x: qnum(D.periods[fd.p0 + i]) - v0, y: v});
      });
      return {label: (D.mgr_names[fd.m] || fd.m) + " · " + fd.name,
              data: pts, borderColor: MGRC[fd.m],
              backgroundColor: MGRC[fd.m], pointRadius: 1.5,
              borderWidth: 1.5, showLine: true};
    })},
    options: {animation: false, responsive: true, parsing: false,
      plugins: {legend: {position: "bottom",
                         labels: {boxWidth: 9, font: {size: 10}}},
                title: {display: true, align: "start",
                        text: MET_LABEL[met] + " vs fund age"}},
      scales: {x: {type: "linear",
                   title: {display: true,
                           text: "fund age (quarters since vintage)"}},
               y: {ticks: {callback: fmt}}}},
  });

  const leagueVal = r => met === "moic" ? r.moic : r[met];
  const cohorts = [...new Set(D.league.filter(r => r.bkt === b)
    .map(r => r.cohort).filter(Boolean))].sort();
  const meds = {};
  for (const m of D.managers) {
    meds[m] = cohorts.map(ch => {
      const v = D.league.filter(r => r.m === m && r.bkt === b
          && r.cohort === ch && leagueVal(r) != null
          && (r.committed || 0) >= 250 && !pbExcl.has(fkey(r)))
        .map(leagueVal).sort((a, z) => a - z);
      return v.length ? v[Math.floor(v.length / 2)] : null;
    });
  }
  matrixTable("tbl-cohmed",
    ["Median " + MET_LABEL[met] + " by cohort",
     ...cohorts],
    D.managers.filter(m => meds[m].some(v => v != null))
      .map(m => [D.mgr_names[m] || m, ...meds[m]]));
  charts.coh && charts.coh.destroy();
  charts.coh = new Chart(document.getElementById("chCohort"), {
    type: "bar",
    data: {labels: cohorts, datasets: D.managers
      .filter(m => meds[m].some(v => v != null))
      .map(m => ({label: D.mgr_names[m] || m, data: meds[m],
        backgroundColor: MGRC[m] + "cc"}))},
    options: {animation: false, responsive: true,
      plugins: {legend: {position: "bottom"},
                title: {display: true, align: "start",
                        text: "Median " + MET_LABEL[met] +
                              " by vintage cohort"}},
      scales: {y: {ticks: {callback: fmt}}}},
  });
}

function agingNav() {
  document.getElementById("ag-scope")
    .addEventListener("change", renderAging);
  renderAging();

  const s10 = D.aging.share10_by_mgr || {};
  new Chart(document.getElementById("chAging10"), {
    type: "line",
    data: {labels: D.periods, datasets: Object.keys(s10)
      .map(m => ({label: D.mgr_names[m] || m, data: s10[m],
        borderColor: MGRC[m], backgroundColor: MGRC[m],
        pointRadius: 0, borderWidth: 1.8, spanGaps: false}))},
    options: {animation: false, responsive: true,
      plugins: {legend: {position: "bottom"}},
      scales: {x: {ticks: {maxTicksLimit: 12}},
               y: {ticks: {callback: v => v + "%"}}}},
  });
}

function renderAging() {
  const a = D.aging[document.getElementById("ag-scope").value];
  charts.aging && charts.aging.destroy();
  const ds = [
    ["Under 6 years", a.young, "#9ca3af"],
    ["6–9 years", a.y6_9, "#b45309"],
    ["10 years +", a.y10p, "#b91c1c"],
  ].map(([label, data, col]) => ({label, data, borderColor: col,
    backgroundColor: col + "bb", pointRadius: 0, borderWidth: 1,
    fill: true, stack: "s", spanGaps: false}));
  charts.aging = new Chart(document.getElementById("chAgingNav"), {
    type: "line",
    data: {labels: D.periods, datasets: ds},
    options: {animation: false, responsive: true,
      plugins: {legend: {position: "bottom"}},
      scales: {x: {ticks: {maxTicksLimit: 12}},
               y: {stacked: true,
                   ticks: {callback: v => "$" + v + "bn"}}}},
  });
}

function rollups(){
  const L = D.periods;
  const mk = (id, key, type, stacked) => new Chart(
    document.getElementById(id), {
      type,
      data: {labels: L, datasets: D.managers
        .filter(m => D.rollups[m][key].some(v => v > 0))
        .map(m => ({label: D.mgr_names[m] || m, data: D.rollups[m][key],
          borderColor: MGRC[m], backgroundColor: type === "line"
            ? MGRC[m] : MGRC[m] + "cc",
          pointRadius: 0, borderWidth: 1.8,
          fill: false, stack: stacked ? "s" : undefined}))},
      options: {animation: false, responsive: true,
        plugins: {legend: {position: "bottom"}},
        scales: {x: {ticks: {maxTicksLimit: 12}},
                 y: {stacked: !!stacked,
                     ticks: {callback: v => "$" + v + "bn"}}}},
    });
  mk("chUnrl", "unrealized", "line", false);
  mk("chRaise", "fundraising", "bar", true);
  mk("chDry", "dry_powder", "line", false);
}

})();
