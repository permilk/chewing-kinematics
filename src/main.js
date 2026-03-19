/**
 * Chewing Kinematics — Main Application
 * Orchestrates data processing, visualization, and UI interactions
 */
import Plotly from 'plotly.js-dist-min';
import { DataProcessor, smoothArray } from './engine/dataProcessor.js';
import { detectCycles, applyFilters } from './engine/cycleDetector.js';
import { exportToExcel, exportSession, importSession } from './engine/exporter.js';

// ── Global State ──
const state = {
  dp: new DataProcessor(),
  cycles: [],
  unit: 'mm',
  unitFactor: 1000,
  invertX: false,
  invertY: false,
  centerOrigin: false,
  normalize: false,
  smoothWindow: 7,
  showSmooth: false,
  showStats: false,
  markers: [],
  lastFilters: {},
  fileName: '',
};

// ── DOM Elements ──
const $ = (id) => document.getElementById(id);
const btnOpen = $('btn-open');
const fileInput = $('file-input');
const unitSelect = $('unit-select');
const select2d = $('select-2d');
const btnAddMarker = $('btn-add-marker');
const btnClearMarkers = $('btn-clear-markers');
const btnSelectZone = $('btn-select-zone');
const btnAutoCycles = $('btn-auto-cycles');
const btnStats = $('btn-stats');
const btnExportImg = $('btn-export-img');
const btnValidate = $('btn-validate');
const btnFilters = $('btn-filters');
const btnSaveSession = $('btn-save-session');
const btnLoadSession = $('btn-load-session');
const sessionInput = $('session-input');
const btnExportExcel = $('btn-export-excel');
const btnInfo = $('btn-info');
const controls3d = $('controls-3d');
const btnSmooth = $('btn-smooth');
const selectSmooth = $('select-smooth');
const btnCenter = $('btn-center');
const btnNormalize = $('btn-normalize');
const btnInvertY = $('btn-invert-y');
const btnInvertX = $('btn-invert-x');
const btnExport3d = $('btn-export-3d');
const btnSelectAll = $('btn-select-all');
const btnDeselectAll = $('btn-deselect-all');

// ── Initialize ──
initEmptyPlots();
wireEvents();
log('Listo. Abre un archivo de datos para comenzar.', '#8b8fa8');
log(`Unidad: <b>${state.unit}</b>`, '#34d399');

function wireEvents() {
  btnOpen.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', handleFileUpload);
  unitSelect.addEventListener('change', handleUnitChange);
  select2d.addEventListener('change', () => update2D());
  btnAutoCycles.addEventListener('click', runAutoCycles);
  btnFilters.addEventListener('click', openFilterModal);
  btnStats.addEventListener('click', toggleStats);
  btnInfo.addEventListener('click', () => $('info-modal').style.display = 'flex');
  $('btn-close-info').addEventListener('click', () => $('info-modal').style.display = 'none');
  btnExportExcel.addEventListener('click', handleExportExcel);
  btnSaveSession.addEventListener('click', handleSaveSession);
  btnLoadSession.addEventListener('click', () => sessionInput.click());
  sessionInput.addEventListener('change', handleLoadSession);
  btnSelectAll.addEventListener('click', () => setAllCycles(true));
  btnDeselectAll.addEventListener('click', () => setAllCycles(false));
  btnClearMarkers.addEventListener('click', clearMarkers);
  btnInvertY.addEventListener('click', () => { state.invertY = !state.invertY; btnInvertY.classList.toggle('active'); update3D(); });
  btnInvertX.addEventListener('click', () => { state.invertX = !state.invertX; btnInvertX.classList.toggle('active'); update3D(); });
  btnCenter.addEventListener('click', () => { state.centerOrigin = !state.centerOrigin; btnCenter.classList.toggle('active'); update3D(); });
  btnNormalize.addEventListener('click', () => { state.normalize = !state.normalize; btnNormalize.classList.toggle('active'); update3D(); });
  btnSmooth.addEventListener('click', () => { state.showSmooth = !state.showSmooth; btnSmooth.classList.toggle('active'); update3D(); });
  selectSmooth.addEventListener('change', (e) => { state.smoothWindow = parseInt(e.target.value); if (state.showSmooth) update3D(); });
  btnExport3d.addEventListener('click', export3DPlotly);
  btnExportImg.addEventListener('click', exportImage2D);
  btnValidate.addEventListener('click', validateArtifacts);

  $('btn-apply-filters').addEventListener('click', applyFilterModal);
  $('btn-cancel-filters').addEventListener('click', () => $('filter-modal').style.display = 'none');
  $('filter-profile-select').addEventListener('change', onProfileChange);

  // Close modals on backdrop click
  for (const modal of document.querySelectorAll('.modal')) {
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });
  }
}

// ══════════════════════════════════════════════
// FILE HANDLING
// ══════════════════════════════════════════════

async function handleFileUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  state.fileName = file.name;
  log(`Cargando archivo: <b>${file.name}</b>...`, '#4c7af5');

  try {
    const text = await file.text();
    state.dp.setUnitFactor(state.unitFactor);
    state.dp.parseFile(text, file.name);
    state.cycles = [];
    state.markers = [];

    log(`Archivo cargado: <b>${file.name}</b> | ${state.dp.length} frames`, '#34d399');
    log(`Ts = ${state.dp.ts.toFixed(4)}s | Frec ≈ ${(1 / state.dp.ts).toFixed(1)} Hz`, '#8b8fa8');

    enableButtons(true);
    populate2DSelector();
    update2D();
    update3D();
    controls3d.style.display = 'flex';
  } catch (err) {
    log(`Error: ${err.message}`, '#ef4444');
  }
  fileInput.value = '';
}

function handleUnitChange() {
  const v = unitSelect.value;
  state.unit = v;
  state.unitFactor = v === 'mm' ? 1000 : 1;
  state.dp.setUnitFactor(state.unitFactor);
  if (state.dp.dataRead) {
    populate2DSelector();
    if (state.cycles.length > 0) runAutoCycles();
    else { update2D(); update3D(); }
  }
}

function enableButtons(enabled) {
  for (const btn of [btnAutoCycles, btnStats, btnExportImg, btnValidate, btnFilters,
    btnSaveSession, btnExportExcel, btnAddMarker, btnClearMarkers, btnSelectZone, select2d]) {
    btn.disabled = !enabled;
  }
}

// ══════════════════════════════════════════════
// 2D PLOT
// ══════════════════════════════════════════════

function populate2DSelector() {
  const s = state.unit;
  select2d.innerHTML = '';
  const options = [
    { val: 'AmBx', label: `Distancia A-B en X (${s})` },
    { val: 'AmBy', label: `Distancia A-B en Y (${s})` },
    { val: 'AmBz', label: `Distancia A-B en Z (${s})` },
    { val: 'd1AmBx', label: `Velocidad X (${s}/s)` },
    { val: 'd1AmBy', label: `Velocidad Y (${s}/s)` },
    { val: 'd1AmBz', label: `Velocidad Z (${s}/s)` },
    { val: 'd2AmBx', label: `Aceleración X (${s}/s²)` },
    { val: 'd2AmBy', label: `Aceleración Y (${s}/s²)` },
    { val: 'd2AmBz', label: `Aceleración Z (${s}/s²)` },
  ];
  for (const o of options) {
    const opt = document.createElement('option');
    opt.value = o.val;
    opt.textContent = o.label;
    select2d.appendChild(opt);
  }
  // Default to Y
  select2d.value = 'AmBy';
}

function update2D() {
  if (!state.dp.dataRead) return;
  const key = select2d.value || 'AmBy';
  const yData = state.dp[key];
  const xData = state.dp.TiempoRelativo;
  const label = select2d.options[select2d.selectedIndex]?.text || key;

  const traces = [{
    x: xData, y: yData,
    type: 'scatter', mode: 'lines',
    line: { color: '#4c7af5', width: 1.5 },
    name: label,
  }];

  // Add cycle regions
  const shapes = [];
  const annotations = [];
  const colors = ['rgba(76,122,245,0.08)', 'rgba(20,184,166,0.08)'];

  for (const c of state.cycles) {
    if (!c.enabled) continue;
    const t0 = xData[c.sp] || 0;
    const t1 = xData[c.ep] || 0;
    shapes.push({
      type: 'rect', xref: 'x', yref: 'paper',
      x0: t0, x1: t1, y0: 0, y1: 1,
      fillcolor: colors[c.cycle % 2],
      line: { width: 0 },
      layer: 'below',
    });
    annotations.push({
      x: (t0 + t1) / 2, y: 1, xref: 'x', yref: 'paper',
      text: `C${c.cycle}`, showarrow: false,
      font: { size: 9, color: c.enabled ? '#8b8fa8' : '#3a3e58' },
      yanchor: 'bottom',
    });
  }

  const layout = {
    title: { text: label, font: { size: 14, color: '#e8eaf0' } },
    xaxis: {
      title: 'Tiempo (s)', color: '#8b8fa8', gridcolor: '#2d3154',
      zerolinecolor: '#2d3154',
    },
    yaxis: {
      title: label, color: '#8b8fa8', gridcolor: '#2d3154',
      zerolinecolor: '#2d3154',
    },
    plot_bgcolor: '#0f1117',
    paper_bgcolor: '#1a1d28',
    margin: { t: 50, r: 30, b: 50, l: 60 },
    shapes,
    annotations,
    font: { family: 'Inter', color: '#e8eaf0' },
    hovermode: 'x unified',
  };

  Plotly.react('plot-2d', traces, layout, { responsive: true, displaylogo: false });
}

// ══════════════════════════════════════════════
// 3D PLOT
// ══════════════════════════════════════════════

function update3D() {
  if (!state.dp.dataRead) return;

  const xm = state.invertX ? -1 : 1;
  const ym = state.invertY ? -1 : 1;
  const s = state.unit;

  const traces = [];
  const enabledCycles = state.cycles.filter(c => c.enabled);

  if (enabledCycles.length > 0) {
    const cycleColors = generateCycleColors(enabledCycles.length);

    for (let i = 0; i < enabledCycles.length; i++) {
      const c = enabledCycles[i];
      let xd = state.dp.AmBx.slice(c.sp, c.ep + 1);
      let yd = state.dp.AmBy.slice(c.sp, c.ep + 1);
      let zd = state.dp.AmBz.slice(c.sp, c.ep + 1);

      if (state.showSmooth && state.smoothWindow > 1) {
        xd = smoothArray(xd, state.smoothWindow);
        yd = smoothArray(yd, state.smoothWindow);
        zd = smoothArray(zd, state.smoothWindow);
      }

      if (state.normalize) {
        const n20 = normalize20pts(xd, yd, zd);
        xd = n20.x; yd = n20.y; zd = n20.z;
      }

      if (state.centerOrigin) {
        const ox = xd[0], oy = yd[0], oz = zd[0];
        xd = xd.map(v => v - ox);
        yd = yd.map(v => v - oy);
        zd = zd.map(v => v - oz);
      }

      traces.push({
        x: xd.map(v => v * xm),
        y: zd,
        z: yd.map(v => v * ym),
        type: 'scatter3d',
        mode: 'lines+markers',
        name: `C${c.cycle} (${c.lado})`,
        line: { color: cycleColors[i], width: 3 },
        marker: { size: 2, color: cycleColors[i] },
      });
    }

    $('cycle-count-badge').style.display = 'block';
    $('cycle-count-badge').textContent = `${enabledCycles.length} ciclos superpuestos`;
  } else {
    // No cycles — show full trajectory
    traces.push({
      x: state.dp.AmBx.map(v => v * xm),
      y: state.dp.AmBz,
      z: state.dp.AmBy.map(v => v * ym),
      type: 'scatter3d',
      mode: 'lines',
      line: { color: '#4c7af5', width: 2 },
      name: 'Trayectoria completa',
    });
    $('cycle-count-badge').style.display = 'none';
  }

  const layout = {
    scene: {
      xaxis: { title: `Lateral (${s})`, color: '#8b8fa8', gridcolor: '#2d3154', backgroundcolor: '#0f1117' },
      yaxis: { title: `AP (${s})`, color: '#8b8fa8', gridcolor: '#2d3154', backgroundcolor: '#0f1117' },
      zaxis: { title: `Vertical (${s})`, color: '#8b8fa8', gridcolor: '#2d3154', backgroundcolor: '#0f1117' },
      bgcolor: '#0f1117',
    },
    paper_bgcolor: '#1a1d28',
    margin: { t: 10, r: 10, b: 10, l: 10 },
    font: { family: 'Inter', color: '#e8eaf0' },
    showlegend: true,
    legend: { x: 0.02, y: 0.98, bgcolor: 'rgba(26,29,40,0.8)', font: { size: 10 } },
  };

  Plotly.react('plot-3d', traces, layout, { responsive: true, displaylogo: false });
}

function normalize20pts(xd, yd, zd) {
  const nPts = 20;
  const n = xd.length;
  const x = [], y = [], z = [];
  for (let i = 0; i < nPts; i++) {
    const frac = i / (nPts - 1);
    const idx = frac * (n - 1);
    const lo = Math.floor(idx);
    const hi = Math.min(lo + 1, n - 1);
    const t = idx - lo;
    x.push(xd[lo] * (1 - t) + xd[hi] * t);
    y.push(yd[lo] * (1 - t) + yd[hi] * t);
    z.push(zd[lo] * (1 - t) + zd[hi] * t);
  }
  return { x, y, z };
}

function generateCycleColors(n) {
  const palette = [
    '#4c7af5', '#ef4444', '#34d399', '#f59e0b', '#a855f7',
    '#14b8a6', '#ec4899', '#22d3ee', '#f97316', '#8b5cf6',
    '#06b6d4', '#10b981', '#e11d48', '#6366f1', '#84cc16',
    '#d946ef', '#0ea5e9', '#facc15', '#fb923c', '#2dd4bf',
  ];
  const colors = [];
  for (let i = 0; i < n; i++) colors.push(palette[i % palette.length]);
  return colors;
}

function initEmptyPlots() {
  Plotly.newPlot('plot-2d', [], {
    plot_bgcolor: '#0f1117', paper_bgcolor: '#1a1d28',
    xaxis: { color: '#8b8fa8', gridcolor: '#2d3154' },
    yaxis: { color: '#8b8fa8', gridcolor: '#2d3154' },
    annotations: [{ text: '📂 Abre un archivo para comenzar', showarrow: false, font: { size: 16, color: '#5a5e78' }, xref: 'paper', yref: 'paper', x: 0.5, y: 0.5 }],
    margin: { t: 50, r: 30, b: 50, l: 60 },
    font: { family: 'Inter' },
  }, { responsive: true, displaylogo: false });

  Plotly.newPlot('plot-3d', [], {
    scene: {
      xaxis: { title: 'Lateral', color: '#8b8fa8', gridcolor: '#2d3154', backgroundcolor: '#0f1117' },
      yaxis: { title: 'AP', color: '#8b8fa8', gridcolor: '#2d3154', backgroundcolor: '#0f1117' },
      zaxis: { title: 'Vertical', color: '#8b8fa8', gridcolor: '#2d3154', backgroundcolor: '#0f1117' },
      bgcolor: '#0f1117',
    },
    paper_bgcolor: '#1a1d28',
    margin: { t: 10, r: 10, b: 10, l: 10 },
    font: { family: 'Inter', color: '#e8eaf0' },
  }, { responsive: true, displaylogo: false });
}

// ══════════════════════════════════════════════
// CYCLE DETECTION
// ══════════════════════════════════════════════

function runAutoCycles() {
  if (!state.dp.dataRead) return;
  log('Ejecutando detección automática de ciclos...', '#4c7af5');

  const prominence = state.unit === 'mm' ? 1.0 : 1000;
  const minVert = state.unit === 'mm' ? 2.0 : 2000;

  state.cycles = detectCycles(state.dp, { prominence, minVerticalMm: minVert });

  if (state.cycles.length === 0) {
    log('No se detectaron ciclos masticatorios válidos.', '#ef4444');
    return;
  }

  const nIzq = state.cycles.filter(c => c.lado === 'Izq').length;
  const nDer = state.cycles.filter(c => c.lado === 'Der').length;
  const nCen = state.cycles.filter(c => c.lado === 'Centro').length;

  log(`<b>${state.cycles.length} ciclos detectados</b> | Izq: ${nIzq} | Der: ${nDer} | Centro: ${nCen}`, '#34d399');

  $('cycle-section').style.display = 'block';
  populateCycleTable();
  update2D();
  update3D();
}

// ══════════════════════════════════════════════
// CYCLE TABLE
// ══════════════════════════════════════════════

function populateCycleTable() {
  const s = state.unit;
  const thead = $('cycle-thead');
  const tbody = $('cycle-tbody');

  const headers = [
    '✔', 'Ciclo', 'Lado', 'Dur(ms)', 'T.Aper(ms)', 'T.Cier(ms)',
    `V.Aper(${s}/s)`, `V.Cier(${s}/s)`, `V.Prom(${s}/s)`, `V.Max(${s}/s)`,
    `Dist X(${s})`, `Dist Y(${s})`, `Dist Z(${s})`, `Dist 3D(${s})`,
    `Max Vert(${s})`, `Max Horiz(${s})`, `Max Sagit(${s})`,
    `Vert Min(${s})`, `Vert Max(${s})`, `Lat Min(${s})`, `Lat Max(${s})`,
    `AP Min(${s})`, `AP Max(${s})`, `Hipot(${s})`,
    `Vel V.Max(${s}/s)`, `Vel L.Max(${s}/s)`, `Vel AP.Max(${s}/s)`,
    `Work Exc(${s})`, `Bal Exc(${s})`, '% Artef'
  ];

  thead.innerHTML = headers.map(h => `<th>${h}</th>`).join('');
  tbody.innerHTML = '';

  for (let i = 0; i < state.cycles.length; i++) {
    const c = state.cycles[i];
    const tr = document.createElement('tr');
    if (!c.enabled) tr.classList.add('disabled');

    const ladoClass = c.lado === 'Izq' ? 'lado-izq' : c.lado === 'Der' ? 'lado-der' : 'lado-centro';

    const numFields = [
      [c.dur_ms, 0], [c.t_opening, 0], [c.t_closing, 0],
      [c.vel_opening, 1], [c.vel_closing, 1], [c.vel_avg, 1], [c.vel_max, 1],
      [c.dist_x, 2], [c.dist_y, 2], [c.dist_z, 2], [c.dist_3d, 2],
      [c.max_vert, 2], [c.max_horiz, 2], [c.max_sagit, 2],
      [c.vert_min, 2], [c.vert_max, 2], [c.lat_min, 2], [c.lat_max, 2],
      [c.ap_min, 2], [c.ap_max, 2], [c.hypotenuse, 2],
      [c.vel_vert_max, 1], [c.vel_lat_max, 1], [c.vel_ap_max, 1],
      [c.working_excursion, 2], [c.balancing_excursion, 2],
      [c.artifact_pct, 1],
    ];

    tr.innerHTML = `
      <td><input type="checkbox" class="cycle-cb" data-idx="${i}" ${c.enabled ? 'checked' : ''}></td>
      <td>C${c.cycle}</td>
      <td class="${ladoClass}">${c.lado}</td>
      ${numFields.map(([v, d]) => `<td>${round(v, d)}</td>`).join('')}
    `;

    tbody.appendChild(tr);
  }

  // Wire checkboxes
  tbody.querySelectorAll('.cycle-cb').forEach(cb => {
    cb.addEventListener('change', (e) => {
      const idx = parseInt(e.target.dataset.idx);
      state.cycles[idx].enabled = e.target.checked;
      e.target.closest('tr').classList.toggle('disabled', !e.target.checked);
      update2D();
      update3D();
    });
  });
}

function setAllCycles(enabled) {
  state.cycles.forEach(c => c.enabled = enabled);
  populateCycleTable();
  update2D();
  update3D();
}

// ══════════════════════════════════════════════
// FILTERS
// ══════════════════════════════════════════════

const FILTER_FIELDS = [
  { group: 'Tiempos', fields: [
    { key: 'dur_ms', label: 'Duración total (ms)', min: 100, max: 5000 },
    { key: 't_opening', label: 'T. Apertura (ms)', min: 0, max: 5000 },
    { key: 't_closing', label: 'T. Cierre (ms)', min: 0, max: 5000 },
  ]},
  { group: 'Distancias', fields: [
    { key: 'max_vert', label: 'Rango Vertical', min: 0, max: 99999 },
    { key: 'max_horiz', label: 'Rango Lateral', min: 0, max: 99999 },
    { key: 'max_sagit', label: 'Rango AP', min: 0, max: 99999 },
    { key: 'dist_3d', label: 'Dist Total 3D', min: 0, max: 99999 },
    { key: 'hypotenuse', label: 'Hipotenusa', min: 0, max: 99999 },
  ]},
  { group: 'Velocidades', fields: [
    { key: 'vel_vert_max', label: 'Vel Vertical Max', min: 0, max: 99999 },
    { key: 'vel_lat_max', label: 'Vel Lateral Max', min: 0, max: 99999 },
    { key: 'vel_ap_max', label: 'Vel AP Max', min: 0, max: 99999 },
    { key: 'vel_max', label: 'Vel 3D Max', min: 0, max: 99999 },
  ]},
];

function openFilterModal() {
  if (!state.cycles.length) { log('Primero ejecute Auto Ciclos.', '#ef4444'); return; }

  const container = $('filter-fields');
  container.innerHTML = '';

  for (const group of FILTER_FIELDS) {
    const title = document.createElement('div');
    title.className = 'filter-group-title';
    title.textContent = group.group;
    container.appendChild(title);

    for (const f of group.fields) {
      const saved = state.lastFilters[f.key];
      const row = document.createElement('div');
      row.className = 'filter-row';
      row.innerHTML = `
        <label>${f.label}:</label>
        <input type="number" data-key="${f.key}" data-role="min" step="0.1" value="${saved ? saved.min : f.min}" placeholder="Min">
        <input type="number" data-key="${f.key}" data-role="max" step="0.1" value="${saved ? saved.max : f.max}" placeholder="Max">
      `;
      container.appendChild(row);
    }
  }

  $('filter-modal').style.display = 'flex';
}

function applyFilterModal() {
  const inputs = $('filter-fields').querySelectorAll('input[data-key]');
  const filters = {};

  inputs.forEach(inp => {
    const key = inp.dataset.key;
    const role = inp.dataset.role;
    if (!filters[key]) filters[key] = {};
    filters[key][role] = parseFloat(inp.value) || 0;
  });

  // Save for persistence
  state.lastFilters = {};
  for (const [key, vals] of Object.entries(filters)) {
    state.lastFilters[key] = { min: vals.min || 0, max: vals.max || 99999 };
  }

  const discarded = applyFilters(state.cycles, state.lastFilters);
  log(`<b>FILTROS APLICADOS:</b> ${discarded} ciclos descartados`, '#a855f7');

  populateCycleTable();
  update2D();
  update3D();
  $('filter-modal').style.display = 'none';
}

function onProfileChange(e) {
  const val = e.target.value;
  const fields = $('filter-fields').querySelectorAll('input[data-key]');

  if (val === 'adulto') {
    setFilterValue(fields, 'dur_ms', 'min', 200);
    setFilterValue(fields, 'dur_ms', 'max', 2000);
    setFilterValue(fields, 'max_vert', 'min', 2.0);
  } else if (val === 'pediatrico') {
    setFilterValue(fields, 'dur_ms', 'min', 150);
    setFilterValue(fields, 'dur_ms', 'max', 2500);
    setFilterValue(fields, 'max_vert', 'min', 1.0);
  }
}

function setFilterValue(inputs, key, role, value) {
  for (const inp of inputs) {
    if (inp.dataset.key === key && inp.dataset.role === role) {
      inp.value = value;
      break;
    }
  }
}

// ══════════════════════════════════════════════
// STATISTICS
// ══════════════════════════════════════════════

function toggleStats() {
  state.showStats = !state.showStats;
  btnStats.classList.toggle('active', state.showStats);

  const existing = document.querySelector('.stats-overlay');
  if (existing) { existing.remove(); return; }

  if (!state.showStats || state.cycles.length === 0) return;

  const enabled = state.cycles.filter(c => c.enabled);
  if (enabled.length === 0) return;

  const avg = (key) => enabled.reduce((s, c) => s + (c[key] || 0), 0) / enabled.length;
  const std = (key) => {
    const m = avg(key);
    return Math.sqrt(enabled.reduce((s, c) => s + ((c[key] || 0) - m) ** 2, 0) / enabled.length);
  };

  const overlay = document.createElement('div');
  overlay.className = 'stats-overlay';
  overlay.innerHTML = `
    <h4>📊 Estadísticas (${enabled.length} ciclos)</h4>
    <div class="stats-row"><span>Duración media:</span><span class="value">${round(avg('dur_ms'), 0)} ±${round(std('dur_ms'), 0)} ms</span></div>
    <div class="stats-row"><span>Max Vertical:</span><span class="value">${round(avg('max_vert'), 2)} ±${round(std('max_vert'), 2)} ${state.unit}</span></div>
    <div class="stats-row"><span>Max Lateral:</span><span class="value">${round(avg('max_horiz'), 2)} ±${round(std('max_horiz'), 2)} ${state.unit}</span></div>
    <div class="stats-row"><span>Max AP:</span><span class="value">${round(avg('max_sagit'), 2)} ±${round(std('max_sagit'), 2)} ${state.unit}</span></div>
    <div class="stats-row"><span>Vel Max:</span><span class="value">${round(avg('vel_max'), 1)} ±${round(std('vel_max'), 1)} ${state.unit}/s</span></div>
    <div class="stats-row"><span>Lateralidad:</span><span class="value">${enabled.filter(c => c.lado === 'Izq').length}I / ${enabled.filter(c => c.lado === 'Der').length}D</span></div>
  `;

  $('panel-2d').appendChild(overlay);
}

// ══════════════════════════════════════════════
// ARTIFACT VALIDATION
// ══════════════════════════════════════════════

function validateArtifacts() {
  if (!state.cycles.length) { log('Primero ejecute Auto Ciclos.', '#ef4444'); return; }
  log('Validando artefactos...', '#4c7af5');

  // Compare sensor A and B correlation to detect head movement
  const n = state.dp.length;
  let headMovFrames = 0;

  for (let i = 1; i < n; i++) {
    const dAx = state.dp.Ax[i] - state.dp.Ax[i - 1];
    const dBx = state.dp.Bx[i] - state.dp.Bx[i - 1];
    const dAy = state.dp.Ay[i] - state.dp.Ay[i - 1];
    const dBy = state.dp.By[i] - state.dp.By[i - 1];

    // If both sensors move in same direction with similar magnitude = head movement
    if (Math.sign(dAx) === Math.sign(dBx) && Math.sign(dAy) === Math.sign(dBy)) {
      const corrX = Math.abs(dAx - dBx) < Math.abs(dAx) * 0.5;
      const corrY = Math.abs(dAy - dBy) < Math.abs(dAy) * 0.5;
      if (corrX && corrY) headMovFrames++;
    }
  }

  const reliability = ((1 - headMovFrames / n) * 100).toFixed(1);
  log(`Confiabilidad global: <b>${reliability}%</b> (${headMovFrames} frames con movimiento de cabeza)`,
    parseFloat(reliability) > 80 ? '#34d399' : '#ef4444');

  // Per-cycle artifact %
  for (const c of state.cycles) {
    let artFrames = 0;
    for (let i = c.sp + 1; i <= c.ep; i++) {
      const dAy = state.dp.Ay[i] - state.dp.Ay[i - 1];
      const dBy = state.dp.By[i] - state.dp.By[i - 1];
      if (Math.sign(dAy) === Math.sign(dBy) && Math.abs(dAy - dBy) < Math.abs(dAy) * 0.5) {
        artFrames++;
      }
    }
    c.artifact_pct = (artFrames / (c.ep - c.sp)) * 100;
  }

  populateCycleTable();
  log('Validación completada. Revise la columna "% Artef" en la tabla.', '#34d399');
}

// ══════════════════════════════════════════════
// EXPORT
// ══════════════════════════════════════════════

function handleExportExcel() {
  if (!state.cycles.length) { log('No hay ciclos para exportar.', '#ef4444'); return; }
  exportToExcel(state.cycles, state.unit, state.fileName);
  log(`Reporte Excel exportado con ${state.cycles.length} ciclos.`, '#34d399');
}

function handleSaveSession() {
  exportSession(state.cycles, state.fileName);
  log('Sesión guardada.', '#34d399');
}

async function handleLoadSession(e) {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const session = await importSession(file);
    state.cycles = session.cycles;
    state.fileName = session.fileName || 'loaded_session';
    log(`Sesión restaurada: <b>${file.name}</b> | ${state.cycles.length} ciclos`, '#34d399');
    $('cycle-section').style.display = 'block';
    populateCycleTable();
    update2D();
    update3D();
  } catch (err) {
    log(`Error: ${err.message}`, '#ef4444');
  }
  sessionInput.value = '';
}

function exportImage2D() {
  Plotly.downloadImage('plot-2d', { format: 'png', width: 1600, height: 900, filename: 'chewing_2d' });
  log('Imagen 2D exportada.', '#34d399');
}

function export3DPlotly() {
  Plotly.downloadImage('plot-3d', { format: 'png', width: 1600, height: 900, filename: 'chewing_3d' });
  log('Imagen 3D exportada.', '#34d399');
}

function clearMarkers() {
  state.markers = [];
  update2D();
  log('Marcadores borrados.', '#8b8fa8');
}

// ══════════════════════════════════════════════
// LOGGING
// ══════════════════════════════════════════════

function log(msg, color = '#8b8fa8') {
  const output = $('log-output');
  const hint = output.querySelector('.log-hint');
  if (hint) hint.remove();

  const time = new Date().toLocaleTimeString('es', { hour12: false });
  const entry = document.createElement('div');
  entry.className = 'log-entry';
  entry.innerHTML = `<span class="log-time">[${time}]</span><span style="color:${color}">${msg}</span>`;
  output.appendChild(entry);
  output.scrollTop = output.scrollHeight;
}

function round(v, d) {
  if (v == null || isNaN(v)) return '—';
  const f = 10 ** d;
  return Math.round(v * f) / f;
}
