/**
 * Chewing Kinematics — Main Application v2 (Premium UI)
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
  lastFilters: {},
  fileName: '',
};

// ── DOM Cache ──
const $ = (id) => document.getElementById(id);

// ── Initialize ──
wireEvents();
log('Sistema listo. Esperando datos...', 'var(--text-3)');

function wireEvents() {
  // File open (sidebar + hero)
  $('btn-open').addEventListener('click', () => $('file-input').click());
  $('btn-hero-open').addEventListener('click', () => $('file-input').click());
  $('file-input').addEventListener('change', handleFileUpload);

  // Unit
  $('unit-select').addEventListener('change', handleUnitChange);

  // 2D selector
  $('select-2d').addEventListener('change', () => update2D());

  // Analysis
  $('btn-auto-cycles').addEventListener('click', runAutoCycles);
  $('btn-validate').addEventListener('click', validateArtifacts);
  $('btn-filters').addEventListener('click', openFilterModal);
  $('btn-stats').addEventListener('click', toggleStats);

  // Export
  $('btn-export-excel').addEventListener('click', handleExportExcel);
  $('btn-save-session').addEventListener('click', handleSaveSession);
  $('btn-load-session').addEventListener('click', () => $('session-input').click());
  $('session-input').addEventListener('change', handleLoadSession);
  $('btn-export-img').addEventListener('click', exportImage2D);

  // 3D controls
  $('btn-smooth').addEventListener('click', () => { state.showSmooth = !state.showSmooth; $('btn-smooth').classList.toggle('active'); update3D(); });
  $('select-smooth').addEventListener('change', (e) => { state.smoothWindow = parseInt(e.target.value); if (state.showSmooth) update3D(); });
  $('btn-invert-y').addEventListener('click', () => { state.invertY = !state.invertY; $('btn-invert-y').classList.toggle('active'); update3D(); });
  $('btn-invert-x').addEventListener('click', () => { state.invertX = !state.invertX; $('btn-invert-x').classList.toggle('active'); update3D(); });
  $('btn-center').addEventListener('click', () => { state.centerOrigin = !state.centerOrigin; $('btn-center').classList.toggle('active'); update3D(); });
  $('btn-normalize').addEventListener('click', () => { state.normalize = !state.normalize; $('btn-normalize').classList.toggle('active'); update3D(); });
  $('btn-export-3d').addEventListener('click', () => Plotly.downloadImage('plot-3d', { format: 'png', width: 1600, height: 900, filename: 'chewing_3d' }));

  // Table controls
  $('btn-select-all').addEventListener('click', () => setAllCycles(true));
  $('btn-deselect-all').addEventListener('click', () => setAllCycles(false));

  // Info modal
  $('btn-info').addEventListener('click', () => $('info-modal').style.display = 'flex');
  $('btn-close-info').addEventListener('click', () => $('info-modal').style.display = 'none');

  // Filter modal
  $('btn-apply-filters').addEventListener('click', applyFilterModal);
  $('btn-cancel-filters').addEventListener('click', () => $('filter-modal').style.display = 'none');
  $('filter-profile-select').addEventListener('change', onProfileChange);

  // Log clear
  $('btn-clear-log').addEventListener('click', () => { $('log-output').innerHTML = ''; });

  // Close modals on backdrop click
  for (const modal of document.querySelectorAll('.modal-overlay')) {
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
  log(`Cargando <b>${file.name}</b>...`, 'var(--indigo-light)');

  try {
    const text = await file.text();
    state.dp.setUnitFactor(state.unitFactor);
    state.dp.parseFile(text, file.name);
    state.cycles = [];

    // Switch from hero to workspace
    $('hero-empty').style.display = 'none';
    $('workspace').style.display = 'flex';
    $('controls-3d').style.display = 'flex';
    $('file-info').style.display = 'flex';

    // Update metadata badges
    $('file-name-badge').textContent = `📄 ${file.name}`;
    $('frame-count-badge').textContent = `${state.dp.length} frames`;
    $('freq-badge').textContent = `${(1 / state.dp.ts).toFixed(0)} Hz`;

    log(`✅ Archivo cargado: <b>${file.name}</b> | ${state.dp.length} frames | Ts=${state.dp.ts.toFixed(4)}s`, 'var(--emerald-light)');

    enableButtons(true);
    populate2DSelector();
    update2D();
    update3D();
  } catch (err) {
    log(`❌ Error: ${err.message}`, 'var(--rose)');
  }
  $('file-input').value = '';
}

function handleUnitChange() {
  state.unit = $('unit-select').value;
  state.unitFactor = state.unit === 'mm' ? 1000 : 1;
  state.dp.setUnitFactor(state.unitFactor);
  if (state.dp.dataRead) {
    populate2DSelector();
    if (state.cycles.length > 0) runAutoCycles();
    else { update2D(); update3D(); }
  }
}

function enableButtons(enabled) {
  const btns = ['btn-auto-cycles', 'btn-validate', 'btn-filters', 'btn-stats',
    'btn-save-session', 'btn-export-excel', 'btn-export-img', 'select-2d'];
  btns.forEach(id => { $(id).disabled = !enabled; });
}

// ══════════════════════════════════════════════
// 2D PLOT
// ══════════════════════════════════════════════

function populate2DSelector() {
  const s = state.unit;
  const sel = $('select-2d');
  sel.innerHTML = '';
  const opts = [
    ['AmBx', `Distancia A-B en X (${s})`], ['AmBy', `Distancia A-B en Y (${s})`], ['AmBz', `Distancia A-B en Z (${s})`],
    ['d1AmBx', `Velocidad X (${s}/s)`], ['d1AmBy', `Velocidad Y (${s}/s)`], ['d1AmBz', `Velocidad Z (${s}/s)`],
    ['d2AmBx', `Aceleración X (${s}/s²)`], ['d2AmBy', `Aceleración Y (${s}/s²)`], ['d2AmBz', `Aceleración Z (${s}/s²)`],
  ];
  for (const [v, l] of opts) {
    const o = document.createElement('option');
    o.value = v; o.textContent = l;
    sel.appendChild(o);
  }
  sel.value = 'AmBy';
}

function update2D() {
  if (!state.dp.dataRead) return;
  const key = $('select-2d').value || 'AmBy';
  const yData = state.dp[key];
  const xData = state.dp.TiempoRelativo;
  const label = $('select-2d').options[$('select-2d').selectedIndex]?.text || key;

  const traces = [{
    x: xData, y: yData, type: 'scatter', mode: 'lines',
    line: { color: '#6366f1', width: 1.5 },
    name: label,
    hovertemplate: '%{y:.3f}<extra></extra>',
  }];

  const shapes = [];
  const annotations = [];
  const cColors = ['rgba(99,102,241,0.06)', 'rgba(6,182,212,0.06)'];

  for (const c of state.cycles) {
    if (!c.enabled) continue;
    shapes.push({
      type: 'rect', xref: 'x', yref: 'paper',
      x0: xData[c.sp], x1: xData[c.ep], y0: 0, y1: 1,
      fillcolor: cColors[c.cycle % 2], line: { width: 0 }, layer: 'below',
    });
    annotations.push({
      x: (xData[c.sp] + xData[c.ep]) / 2, y: 1, xref: 'x', yref: 'paper',
      text: `C${c.cycle}`, showarrow: false,
      font: { size: 9, color: '#6b7094' }, yanchor: 'bottom',
    });
  }

  Plotly.react('plot-2d', traces, {
    title: { text: label, font: { size: 13, color: '#a0a5c0' } },
    xaxis: { title: 'Tiempo (s)', color: '#6b7094', gridcolor: 'rgba(99,102,241,0.08)', zerolinecolor: 'rgba(99,102,241,0.15)' },
    yaxis: { title: label, color: '#6b7094', gridcolor: 'rgba(99,102,241,0.08)', zerolinecolor: 'rgba(99,102,241,0.15)' },
    plot_bgcolor: '#06080d', paper_bgcolor: 'rgba(0,0,0,0)',
    margin: { t: 42, r: 20, b: 48, l: 55 },
    shapes, annotations,
    font: { family: 'Inter', color: '#eef0f6' },
    hovermode: 'x unified',
  }, { responsive: true, displaylogo: false });
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
  const enabled = state.cycles.filter(c => c.enabled);

  if (enabled.length > 0) {
    const colors = palette(enabled.length);
    for (let i = 0; i < enabled.length; i++) {
      const c = enabled[i];
      let xd = state.dp.AmBx.slice(c.sp, c.ep + 1);
      let yd = state.dp.AmBy.slice(c.sp, c.ep + 1);
      let zd = state.dp.AmBz.slice(c.sp, c.ep + 1);
      if (state.showSmooth && state.smoothWindow > 1) { xd = smoothArray(xd, state.smoothWindow); yd = smoothArray(yd, state.smoothWindow); zd = smoothArray(zd, state.smoothWindow); }
      if (state.normalize) { const n = normalize20(xd, yd, zd); xd = n.x; yd = n.y; zd = n.z; }
      if (state.centerOrigin) { const ox = xd[0], oy = yd[0], oz = zd[0]; xd = xd.map(v => v - ox); yd = yd.map(v => v - oy); zd = zd.map(v => v - oz); }
      traces.push({
        x: xd.map(v => v * xm), y: zd, z: yd.map(v => v * ym),
        type: 'scatter3d', mode: 'lines+markers',
        name: `C${c.cycle} (${c.lado})`,
        line: { color: colors[i], width: 3 },
        marker: { size: 2, color: colors[i] },
      });
    }
    $('cycle-count-badge').style.display = 'inline-flex';
    $('cycle-count-badge').textContent = `${enabled.length} ciclos`;
  } else {
    traces.push({
      x: state.dp.AmBx.map(v => v * xm), y: state.dp.AmBz, z: state.dp.AmBy.map(v => v * ym),
      type: 'scatter3d', mode: 'lines',
      line: { color: '#6366f1', width: 2 }, name: 'Trayectoria',
    });
    $('cycle-count-badge').style.display = 'none';
  }

  const axStyle = (title) => ({
    title, color: '#6b7094',
    gridcolor: 'rgba(99,102,241,0.1)',
    backgroundcolor: '#06080d',
  });

  Plotly.react('plot-3d', traces, {
    scene: { xaxis: axStyle(`Lateral (${s})`), yaxis: axStyle(`AP (${s})`), zaxis: axStyle(`Vertical (${s})`), bgcolor: '#06080d' },
    paper_bgcolor: 'rgba(0,0,0,0)',
    margin: { t: 5, r: 5, b: 5, l: 5 },
    font: { family: 'Inter', color: '#eef0f6' },
    showlegend: true,
    legend: { x: 0.02, y: 0.98, bgcolor: 'rgba(12,15,24,0.85)', font: { size: 10 } },
  }, { responsive: true, displaylogo: false });
}

function normalize20(xd, yd, zd) {
  const n = xd.length, pts = 20;
  const x = [], y = [], z = [];
  for (let i = 0; i < pts; i++) {
    const frac = i / (pts - 1), idx = frac * (n - 1);
    const lo = Math.floor(idx), hi = Math.min(lo + 1, n - 1), t = idx - lo;
    x.push(xd[lo] * (1 - t) + xd[hi] * t);
    y.push(yd[lo] * (1 - t) + yd[hi] * t);
    z.push(zd[lo] * (1 - t) + zd[hi] * t);
  }
  return { x, y, z };
}

function palette(n) {
  const c = ['#6366f1','#f43f5e','#10b981','#f59e0b','#a855f7','#06b6d4','#ec4899','#22d3ee','#f97316','#8b5cf6','#0ea5e9','#84cc16','#e11d48','#facc15','#2dd4bf','#d946ef','#fb923c','#14b8a6','#6366f1','#34d399'];
  return Array.from({length: n}, (_, i) => c[i % c.length]);
}

// ══════════════════════════════════════════════
// CYCLE DETECTION
// ══════════════════════════════════════════════

function runAutoCycles() {
  if (!state.dp.dataRead) return;
  log('⚡ Detectando ciclos masticatorios...', 'var(--indigo-light)');

  const prom = state.unit === 'mm' ? 1.0 : 1000;
  const minV = state.unit === 'mm' ? 2.0 : 2000;
  state.cycles = detectCycles(state.dp, { prominence: prom, minVerticalMm: minV });

  if (state.cycles.length === 0) {
    log('⚠ No se detectaron ciclos válidos.', 'var(--rose)');
    return;
  }

  const en = state.cycles.filter(c => c.enabled);
  const nI = en.filter(c => c.lado === 'Izq').length;
  const nD = en.filter(c => c.lado === 'Der').length;
  const nC = en.filter(c => c.lado === 'Centro').length;
  const avgDur = en.reduce((s, c) => s + c.dur_ms, 0) / en.length;
  const avgVert = en.reduce((s, c) => s + c.max_vert, 0) / en.length;

  log(`✅ <b>${state.cycles.length} ciclos</b> detectados | Izq: ${nI} · Der: ${nD} · Centro: ${nC}`, 'var(--emerald-light)');

  // Update summary cards
  updateSummaryCards(en, nI, nD, avgDur, avgVert);

  $('cycle-section').style.display = 'block';
  $('summary-cards').style.display = 'grid';
  populateCycleTable();
  update2D();
  update3D();
}

function updateSummaryCards(enabled, nI, nD, avgDur, avgVert) {
  $('val-cycles').textContent = enabled.length;
  $('val-laterality').textContent = `${nI}I / ${nD}D`;
  $('val-duration').textContent = `${Math.round(avgDur)} ms`;
  $('val-vertical').textContent = `${avgVert.toFixed(2)} ${state.unit}`;
}

// ══════════════════════════════════════════════
// CYCLE TABLE
// ══════════════════════════════════════════════

function populateCycleTable() {
  const s = state.unit;
  const thead = $('cycle-thead');
  const tbody = $('cycle-tbody');

  const headers = [
    '✔','Ciclo','Lado','Dur(ms)','T.Aper','T.Cier',
    `V.Aper(${s}/s)`,`V.Cier(${s}/s)`,`V.Prom`,`V.Max`,
    `DistX`,`DistY`,`DistZ`,`Dist3D`,
    `MaxVert`,`MaxHoriz`,`MaxSag`,
    `VertMn`,`VertMx`,`LatMn`,`LatMx`,
    `APMn`,`APMx`,`Hipot`,
    `VelV.Max`,`VelL.Max`,`VelAP.Max`,
    `WorkExc`,`BalExc`,'%Art'
  ];

  thead.innerHTML = headers.map(h => `<th>${h}</th>`).join('');
  tbody.innerHTML = '';

  for (let i = 0; i < state.cycles.length; i++) {
    const c = state.cycles[i];
    const tr = document.createElement('tr');
    if (!c.enabled) tr.classList.add('disabled');
    const lc = c.lado === 'Izq' ? 'lado-izq' : c.lado === 'Der' ? 'lado-der' : 'lado-centro';

    const nums = [
      [c.dur_ms,0],[c.t_opening,0],[c.t_closing,0],
      [c.vel_opening,1],[c.vel_closing,1],[c.vel_avg,1],[c.vel_max,1],
      [c.dist_x,2],[c.dist_y,2],[c.dist_z,2],[c.dist_3d,2],
      [c.max_vert,2],[c.max_horiz,2],[c.max_sagit,2],
      [c.vert_min,2],[c.vert_max,2],[c.lat_min,2],[c.lat_max,2],
      [c.ap_min,2],[c.ap_max,2],[c.hypotenuse,2],
      [c.vel_vert_max,1],[c.vel_lat_max,1],[c.vel_ap_max,1],
      [c.working_excursion,2],[c.balancing_excursion,2],
      [c.artifact_pct,1],
    ];

    tr.innerHTML = `
      <td><input type="checkbox" class="cycle-cb" data-idx="${i}" ${c.enabled ? 'checked' : ''}></td>
      <td>C${c.cycle}</td>
      <td class="${lc}">${c.lado}</td>
      ${nums.map(([v,d]) => `<td>${rd(v,d)}</td>`).join('')}
    `;
    tbody.appendChild(tr);
  }

  tbody.querySelectorAll('.cycle-cb').forEach(cb => {
    cb.addEventListener('change', (e) => {
      const idx = parseInt(e.target.dataset.idx);
      state.cycles[idx].enabled = e.target.checked;
      e.target.closest('tr').classList.toggle('disabled', !e.target.checked);
      update2D(); update3D();
      refreshSummaryCards();
    });
  });
}

function setAllCycles(enabled) {
  state.cycles.forEach(c => c.enabled = enabled);
  populateCycleTable();
  update2D(); update3D();
  refreshSummaryCards();
}

function refreshSummaryCards() {
  const en = state.cycles.filter(c => c.enabled);
  if (en.length > 0) {
    const nI = en.filter(c => c.lado === 'Izq').length;
    const nD = en.filter(c => c.lado === 'Der').length;
    updateSummaryCards(en, nI, nD,
      en.reduce((s,c) => s + c.dur_ms, 0) / en.length,
      en.reduce((s,c) => s + c.max_vert, 0) / en.length);
  }
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
  if (!state.cycles.length) { log('⚠ Ejecute Auto Ciclos primero.', 'var(--rose)'); return; }
  const container = $('filter-fields');
  container.innerHTML = '';
  for (const g of FILTER_FIELDS) {
    const t = document.createElement('div');
    t.className = 'filter-group-title'; t.textContent = g.group;
    container.appendChild(t);
    for (const f of g.fields) {
      const sv = state.lastFilters[f.key];
      const r = document.createElement('div');
      r.className = 'filter-row';
      r.innerHTML = `<label>${f.label}:</label>
        <input type="number" data-key="${f.key}" data-role="min" step="0.1" value="${sv ? sv.min : f.min}" placeholder="Min">
        <input type="number" data-key="${f.key}" data-role="max" step="0.1" value="${sv ? sv.max : f.max}" placeholder="Max">`;
      container.appendChild(r);
    }
  }
  $('filter-modal').style.display = 'flex';
}

function applyFilterModal() {
  const inputs = $('filter-fields').querySelectorAll('input[data-key]');
  const filters = {};
  inputs.forEach(inp => {
    const k = inp.dataset.key, r = inp.dataset.role;
    if (!filters[k]) filters[k] = {};
    filters[k][r] = parseFloat(inp.value) || 0;
  });
  state.lastFilters = {};
  for (const [k, v] of Object.entries(filters)) state.lastFilters[k] = { min: v.min||0, max: v.max||99999 };

  const disc = applyFilters(state.cycles, state.lastFilters);
  log(`⚙ <b>Filtros aplicados:</b> ${disc} ciclos descartados`, 'var(--violet)');
  populateCycleTable(); update2D(); update3D(); refreshSummaryCards();
  $('filter-modal').style.display = 'none';
}

function onProfileChange(e) {
  const inputs = $('filter-fields').querySelectorAll('input[data-key]');
  if (e.target.value === 'adulto') {
    setFV(inputs,'dur_ms','min',200); setFV(inputs,'dur_ms','max',2000); setFV(inputs,'max_vert','min',2.0);
  } else if (e.target.value === 'pediatrico') {
    setFV(inputs,'dur_ms','min',150); setFV(inputs,'dur_ms','max',2500); setFV(inputs,'max_vert','min',1.0);
  }
}

function setFV(inputs, key, role, val) {
  for (const inp of inputs) if (inp.dataset.key === key && inp.dataset.role === role) { inp.value = val; break; }
}

// ══════════════════════════════════════════════
// STATISTICS
// ══════════════════════════════════════════════

function toggleStats() {
  state.showStats = !state.showStats;
  const existing = document.querySelector('.stats-overlay');
  if (existing) { existing.remove(); return; }
  if (!state.showStats || state.cycles.length === 0) return;
  const en = state.cycles.filter(c => c.enabled);
  if (en.length === 0) return;
  const avg = (k) => en.reduce((s,c) => s+(c[k]||0), 0)/en.length;
  const std = (k) => { const m=avg(k); return Math.sqrt(en.reduce((s,c) => s+((c[k]||0)-m)**2,0)/en.length); };

  const ov = document.createElement('div');
  ov.className = 'stats-overlay';
  ov.innerHTML = `
    <h4>📊 Estadísticas (${en.length} ciclos)</h4>
    <div class="stats-row"><span>Duración:</span><span class="value">${rd(avg('dur_ms'),0)} ±${rd(std('dur_ms'),0)} ms</span></div>
    <div class="stats-row"><span>Vertical:</span><span class="value">${rd(avg('max_vert'),2)} ±${rd(std('max_vert'),2)} ${state.unit}</span></div>
    <div class="stats-row"><span>Lateral:</span><span class="value">${rd(avg('max_horiz'),2)} ±${rd(std('max_horiz'),2)} ${state.unit}</span></div>
    <div class="stats-row"><span>AP:</span><span class="value">${rd(avg('max_sagit'),2)} ±${rd(std('max_sagit'),2)} ${state.unit}</span></div>
    <div class="stats-row"><span>Vel Max:</span><span class="value">${rd(avg('vel_max'),1)} ±${rd(std('vel_max'),1)} ${state.unit}/s</span></div>
    <div class="stats-row"><span>Lateralidad:</span><span class="value">${en.filter(c => c.lado==='Izq').length}I / ${en.filter(c => c.lado==='Der').length}D</span></div>
  `;
  document.querySelector('.plot-card')?.appendChild(ov);
}

// ══════════════════════════════════════════════
// ARTIFACT VALIDATION
// ══════════════════════════════════════════════

function validateArtifacts() {
  if (!state.cycles.length) { log('⚠ Ejecute Auto Ciclos primero.', 'var(--rose)'); return; }
  log('✓ Validando artefactos...', 'var(--indigo-light)');
  const n = state.dp.length;
  let headFrames = 0;
  for (let i = 1; i < n; i++) {
    const dAx = state.dp.Ax[i]-state.dp.Ax[i-1], dBx = state.dp.Bx[i]-state.dp.Bx[i-1];
    const dAy = state.dp.Ay[i]-state.dp.Ay[i-1], dBy = state.dp.By[i]-state.dp.By[i-1];
    if (Math.sign(dAx)===Math.sign(dBx)&&Math.sign(dAy)===Math.sign(dBy)) {
      if (Math.abs(dAx-dBx)<Math.abs(dAx)*0.5&&Math.abs(dAy-dBy)<Math.abs(dAy)*0.5) headFrames++;
    }
  }
  const rel = ((1-headFrames/n)*100).toFixed(1);
  log(`Confiabilidad: <b>${rel}%</b> (${headFrames} frames con movimiento de cabeza)`, parseFloat(rel)>80?'var(--emerald-light)':'var(--rose)');
  $('val-reliability').textContent = `${rel}%`;

  for (const c of state.cycles) {
    let af = 0;
    for (let i = c.sp+1; i <= c.ep; i++) {
      const dAy=state.dp.Ay[i]-state.dp.Ay[i-1], dBy=state.dp.By[i]-state.dp.By[i-1];
      if (Math.sign(dAy)===Math.sign(dBy)&&Math.abs(dAy-dBy)<Math.abs(dAy)*0.5) af++;
    }
    c.artifact_pct = (af/(c.ep-c.sp))*100;
  }
  populateCycleTable();
  log('✅ Validación completada.', 'var(--emerald-light)');
}

// ══════════════════════════════════════════════
// EXPORT & SESSION
// ══════════════════════════════════════════════

function handleExportExcel() {
  if (!state.cycles.length) { log('⚠ No hay ciclos.', 'var(--rose)'); return; }
  exportToExcel(state.cycles, state.unit, state.fileName);
  log('📋 Reporte Excel exportado.', 'var(--emerald-light)');
}

function handleSaveSession() {
  exportSession(state.cycles, state.fileName);
  log('💾 Sesión guardada.', 'var(--emerald-light)');
}

async function handleLoadSession(e) {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const session = await importSession(file);
    state.cycles = session.cycles;
    state.fileName = session.fileName || 'sesion';
    $('hero-empty').style.display = 'none';
    $('workspace').style.display = 'flex';
    $('summary-cards').style.display = 'grid';
    $('cycle-section').style.display = 'block';
    log(`📥 Sesión restaurada: <b>${file.name}</b> | ${state.cycles.length} ciclos`, 'var(--emerald-light)');
    populateCycleTable();
    refreshSummaryCards();
  } catch (err) { log(`❌ ${err.message}`, 'var(--rose)'); }
  $('session-input').value = '';
}

function exportImage2D() {
  Plotly.downloadImage('plot-2d', { format: 'png', width: 1600, height: 900, filename: 'chewing_2d' });
  log('📷 Imagen 2D exportada.', 'var(--emerald-light)');
}

// ══════════════════════════════════════════════
// LOGGING
// ══════════════════════════════════════════════

function log(msg, color = 'var(--text-3)') {
  const out = $('log-output');
  const time = new Date().toLocaleTimeString('es', { hour12: false });
  const entry = document.createElement('div');
  entry.className = 'log-entry';
  entry.innerHTML = `<span class="log-time">[${time}]</span><span style="color:${color}">${msg}</span>`;
  out.appendChild(entry);
  out.scrollTop = out.scrollHeight;
}

function rd(v, d) {
  if (v == null || isNaN(v)) return '—';
  const f = 10 ** d;
  return Math.round(v * f) / f;
}
