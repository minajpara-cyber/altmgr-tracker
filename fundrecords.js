/* Fund Records page — wrapped in an IIFE: app.js owns global
   fmtM/fmtPct, and top-level const redeclaration is a SyntaxError that
   silently kills the whole script. */
(() => {
const MGRC = {BX:"#16803c", KKR:"#b45309", CG:"#1d4ed8", APO:"#7c3aed",
              ARES:"#0e7490", OWL:"#be185d", TPG:"#57534e"};
const SYM = {USD:"$", EUR:"€", JPY:"¥", GBP:"£"};
let D = null, charts = {};

const fmtM = (v, ccy) => v == null ? "" :
  (SYM[ccy] || "$") + v.toLocaleString("en-US");
const fmtPct = v => v == null ? "" : v.toFixed(1) + "%";
const fmtX = v => v == null ? "" : v.toFixed(2) + "x";

if (typeof paintRefreshDate === "function") paintRefreshDate();
fetch("./fundrecords.json", {cache: "no-store"}).then(r => r.json()).then(d => {
  D = d;
  stats(); filters(); league(); watch(); rollups(); cohortChart();
});

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
  ["f-mgr", "f-seg", "f-coh"].forEach(id =>
    document.getElementById(id).addEventListener("change", applyFilters));
  document.getElementById("f-q").addEventListener("input", applyFilters);
}

let leagueTable = null;
function applyFilters() {
  const m = document.getElementById("f-mgr").value;
  const s = document.getElementById("f-seg").value;
  const c = document.getElementById("f-coh").value;
  const q = document.getElementById("f-q").value.toLowerCase();
  leagueTable.setFilter(row => (!m || row.m === m) && (!s || row.seg === s)
    && (!c || row.cohort === c)
    && (!q || row.name.toLowerCase().includes(q)));
}

function league() {
  leagueTable = new Tabulator("#tbl-frleague", {
    data: D.league, layout: "fitColumns", height: "560px",
    initialSort: [{column: "usd_unrealized", dir: "desc"}],
    columns: [
      {title: "Mgr", field: "m", width: 66,
       formatter: c => D.mgr_names[c.getValue()] || c.getValue()},
      {title: "Fund", field: "name", minWidth: 210},
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
       formatter: c => fmtPct(c.getValue())},
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
  new Tabulator("#tbl-frwatch", {
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
    (fd.ccy !== "USD" ? '<span class="badge">' + fd.ccy + '</span>' : "");
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

function cohortChart(){
  const cohorts = [...new Set(D.league.map(r => r.cohort)
    .filter(Boolean))].sort();
  const meds = {};
  for (const m of D.managers) meds[m] = [];
  for (const m of D.managers) {
    for (const c of cohorts) {
      const v = D.league.filter(r => r.m === m && r.cohort === c
          && r.nirr != null && (r.committed || 0) >= 250)
        .map(r => r.nirr).sort((a, b) => a - b);
      meds[m].push(v.length ? v[Math.floor(v.length / 2)] : null);
    }
  }
  new Chart(document.getElementById("chCohort"), {
    type: "bar",
    data: {labels: cohorts, datasets: D.managers
      .filter(m => meds[m].some(v => v != null))
      .map(m => ({label: D.mgr_names[m] || m, data: meds[m],
        backgroundColor: MGRC[m] + "cc"}))},
    options: {animation: false, responsive: true,
      plugins: {legend: {position: "bottom"}},
      scales: {y: {ticks: {callback: v => v + "%"}}}},
  });
}
})();
