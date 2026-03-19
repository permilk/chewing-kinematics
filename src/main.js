/**
 * Chewing Kinematics — Main Application v3 (Light Theme + SVG Icons)
 */
import Plotly from 'plotly.js-dist-min';
import { DataProcessor, smoothArray } from './engine/dataProcessor.js';
import { detectCycles, applyFilters } from './engine/cycleDetector.js';
import { exportToExcel, exportSession, importSession } from './engine/exporter.js';
import { icons } from './icons.js';

// ── State ──
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

const $ = (id) => document.getElementById(id);

// ── Boot ──
injectIcons();
wireEvents();
log('Sistema listo. Esperando datos...', 'var(--text-3)');

function injectIcons() {
  const map = {
    'ico-folder': icons.folder,
    'ico-download': icons.download,
    'ico-zap': icons.zap,
    'ico-check': icons.check,
    'ico-settings': icons.settings,
    'ico-barchart': icons.barChart,
    'ico-save': icons.save,
    'ico-clipboard': icons.clipboard,
    'ico-camera': icons.camera,
    'ico-info': icons.info,
    'ico-card-cycles': icons.refresh,
    'ico-card-lat': icons.arrowsH,
    'ico-card-dur': icons.clock,
    'ico-card-vert': icons.ruler,
    'ico-card-rel': icons.shield,
  };
  for (const [id, svg] of Object.entries(map)) {
    const el = $(id);
    if (el) el.innerHTML = svg;
  }
}

function wireEvents() {
  $('btn-open').addEventListener('click', () => $('file-input').click());
  $('btn-hero-open').addEventListener('click', () => $('file-input').click());
  $('file-input').addEventListener('change', handleFileUpload);
  $('unit-select').addEventListener('change', handleUnitChange);
  $('select-2d').addEventListener('change', () => update2D());
  $('btn-auto-cycles').addEventListener('click', runAutoCycles);
  $('btn-validate').addEventListener('click', validateArtifacts);
  $('btn-filters').addEventListener('click', openFilterModal);
  $('btn-stats').addEventListener('click', toggleStats);
  $('btn-export-excel').addEventListener('click', handleExportExcel);
  $('btn-save-session').addEventListener('click', handleSaveSession);
  $('btn-load-session').addEventListener('click', () => $('session-input').click());
  $('session-input').addEventListener('change', handleLoadSession);
  $('btn-export-img').addEventListener('click', () => { Plotly.downloadImage('plot-2d', { format: 'png', width: 1600, height: 900, filename: 'chewing_2d' }); log('Imagen 2D exportada.', 'var(--emerald)'); });
  $('btn-smooth').addEventListener('click', () => { state.showSmooth = !state.showSmooth; $('btn-smooth').classList.toggle('active'); update3D(); });
  $('select-smooth').addEventListener('change', (e) => { state.smoothWindow = parseInt(e.target.value); if (state.showSmooth) update3D(); });
  $('btn-invert-y').addEventListener('click', () => { state.invertY = !state.invertY; $('btn-invert-y').classList.toggle('active'); update3D(); });
  $('btn-invert-x').addEventListener('click', () => { state.invertX = !state.invertX; $('btn-invert-x').classList.toggle('active'); update3D(); });
  $('btn-center').addEventListener('click', () => { state.centerOrigin = !state.centerOrigin; $('btn-center').classList.toggle('active'); update3D(); });
  $('btn-normalize').addEventListener('click', () => { state.normalize = !state.normalize; $('btn-normalize').classList.toggle('active'); update3D(); });
  $('btn-export-3d').addEventListener('click', () => { Plotly.downloadImage('plot-3d', { format: 'png', width: 1600, height: 900, filename: 'chewing_3d' }); log('Imagen 3D exportada.', 'var(--emerald)'); });
  $('btn-select-all').addEventListener('click', () => setAllCycles(true));
  $('btn-deselect-all').addEventListener('click', () => setAllCycles(false));
  $('btn-info').addEventListener('click', () => $('info-modal').style.display = 'flex');
  $('btn-close-info').addEventListener('click', () => $('info-modal').style.display = 'none');
  $('btn-apply-filters').addEventListener('click', applyFilterModal);
  $('btn-cancel-filters').addEventListener('click', () => $('filter-modal').style.display = 'none');
  $('filter-profile-select').addEventListener('change', onProfileChange);
  $('btn-clear-log').addEventListener('click', () => { $('log-output').innerHTML = ''; });
  for (const m of document.querySelectorAll('.modal-overlay')) {
    m.addEventListener('click', (e) => { if (e.target === m) m.style.display = 'none'; });
  }
}

// ── FILE ──
async function handleFileUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  state.fileName = file.name;
  log(`Cargando ${file.name}...`, 'var(--indigo)');
  try {
    const text = await file.text();
    state.dp.setUnitFactor(state.unitFactor);
    state.dp.parseFile(text, file.name);
    state.cycles = [];
    $('hero-empty').style.display = 'none';
    $('workspace').style.display = 'flex';
    $('controls-3d').style.display = 'flex';
    $('file-info').style.display = 'flex';
    $('file-name-badge').textContent = file.name;
    $('frame-count-badge').textContent = `${state.dp.length} frames`;
    $('freq-badge').textContent = `${(1 / state.dp.ts).toFixed(0)} Hz`;
    log(`Archivo cargado: ${file.name} — ${state.dp.length} frames — Ts=${state.dp.ts.toFixed(4)}s`, 'var(--emerald)');
    enableButtons(true);
    populate2DSelector();
    update2D();
    update3D();
  } catch (err) { log(`Error: ${err.message}`, 'var(--rose)'); }
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

function enableButtons(on) {
  ['btn-auto-cycles','btn-validate','btn-filters','btn-stats','btn-save-session','btn-export-excel','btn-export-img','select-2d']
    .forEach(id => { $(id).disabled = !on; });
}

// ── 2D PLOT ──
function populate2DSelector() {
  const s = state.unit, sel = $('select-2d');
  sel.innerHTML = '';
  [['AmBx',`Distancia A-B en X (${s})`],['AmBy',`Distancia A-B en Y (${s})`],['AmBz',`Distancia A-B en Z (${s})`],
   ['d1AmBx',`Velocidad X (${s}/s)`],['d1AmBy',`Velocidad Y (${s}/s)`],['d1AmBz',`Velocidad Z (${s}/s)`],
   ['d2AmBx',`Acel X (${s}/s²)`],['d2AmBy',`Acel Y (${s}/s²)`],['d2AmBz',`Acel Z (${s}/s²)`]]
    .forEach(([v,l]) => { const o = document.createElement('option'); o.value=v; o.textContent=l; sel.appendChild(o); });
  sel.value = 'AmBy';
}

function update2D() {
  if (!state.dp.dataRead) return;
  const key = $('select-2d').value || 'AmBy';
  const y = state.dp[key], x = state.dp.TiempoRelativo;
  const label = $('select-2d').options[$('select-2d').selectedIndex]?.text || key;

  // Main signal trace
  const traces = [{
    x, y, type: 'scatter', mode: 'lines',
    line: { color: '#4f46e5', width: 1.8 },
    name: label,
    hovertemplate: '<b>%{x:.3f}s</b><br>%{y:.3f}<extra></extra>',
  }];

  const shapes = [], annots = [];
  // Alternating pastel fills with stronger contrast
  const cycleColors = [
    { fill: 'rgba(79,70,229,0.10)', border: 'rgba(79,70,229,0.35)', text: '#4f46e5' },
    { fill: 'rgba(8,145,178,0.10)',  border: 'rgba(8,145,178,0.35)', text: '#0891b2' },
  ];

  let enabledIdx = 0;
  for (const c of state.cycles) {
    if (!c.enabled) continue;
    const t0 = x[c.sp] || 0, t1 = x[c.ep] || 0;
    const cs = cycleColors[enabledIdx % 2];

    // Colored region with fill
    shapes.push({
      type: 'rect', xref: 'x', yref: 'paper',
      x0: t0, x1: t1, y0: 0, y1: 1,
      fillcolor: cs.fill,
      line: { width: 0 },
      layer: 'below',
    });

    // Left border line for each cycle
    shapes.push({
      type: 'line', xref: 'x', yref: 'paper',
      x0: t0, x1: t0, y0: 0, y1: 1,
      line: { color: cs.border, width: 1, dash: 'dot' },
      layer: 'below',
    });

    // Stagger labels: alternate between top (y=1.02) and slightly lower (y=1.06)
    // This prevents overlap when cycles are close together
    const yPos = enabledIdx % 2 === 0 ? 1.02 : 1.07;

    annots.push({
      x: (t0 + t1) / 2,
      y: yPos,
      xref: 'x',
      yref: 'paper',
      text: `<b>${c.cycle}</b>`,
      showarrow: false,
      font: { size: 8, color: cs.text, family: 'Inter' },
      yanchor: 'bottom',
      bgcolor: 'rgba(255,255,255,0.85)',
      bordercolor: cs.border,
      borderwidth: 1,
      borderpad: 2,
    });

    enabledIdx++;
  }

  Plotly.react('plot-2d', traces, {
    title: { text: label, font: { size: 13, color: '#4a5068' }, y: 0.98 },
    xaxis: {
      title: { text: 'Tiempo (s)', font: { size: 11 } },
      color: '#7c82a0', gridcolor: '#eef0f6', zerolinecolor: '#d4d9e8',
      tickfont: { size: 10 },
    },
    yaxis: {
      title: { text: label.split('(')[0].trim(), font: { size: 11 } },
      color: '#7c82a0', gridcolor: '#eef0f6', zerolinecolor: '#d4d9e8',
      tickfont: { size: 10 },
    },
    plot_bgcolor: '#ffffff',
    paper_bgcolor: '#ffffff',
    margin: { t: 60, r: 24, b: 50, l: 58 },
    shapes,
    annotations: annots,
    font: { family: 'Inter', color: '#1a1d2e' },
    hovermode: 'x unified',
    hoverlabel: { bgcolor: '#fff', bordercolor: '#d4d9e8', font: { size: 11, family: 'Inter' } },
  }, { responsive: true, displaylogo: false, displayModeBar: true, modeBarButtonsToRemove: ['lasso2d', 'select2d'] });
}

// ── 3D PLOT ──
function update3D() {
  if (!state.dp.dataRead) return;
  const xm = state.invertX?-1:1, ym = state.invertY?-1:1, s = state.unit;
  const traces = [], en = state.cycles.filter(c=>c.enabled);

  if (en.length > 0) {
    const cols = palette(en.length);
    for (let i=0; i<en.length; i++) {
      const c=en[i];
      let xd=state.dp.AmBx.slice(c.sp,c.ep+1), yd=state.dp.AmBy.slice(c.sp,c.ep+1), zd=state.dp.AmBz.slice(c.sp,c.ep+1);
      if (state.showSmooth&&state.smoothWindow>1) { xd=smoothArray(xd,state.smoothWindow); yd=smoothArray(yd,state.smoothWindow); zd=smoothArray(zd,state.smoothWindow); }
      if (state.normalize) { const n=norm20(xd,yd,zd); xd=n.x; yd=n.y; zd=n.z; }
      if (state.centerOrigin) { const ox=xd[0],oy=yd[0],oz=zd[0]; xd=xd.map(v=>v-ox); yd=yd.map(v=>v-oy); zd=zd.map(v=>v-oz); }
      traces.push({ x:xd.map(v=>v*xm), y:zd, z:yd.map(v=>v*ym), type:'scatter3d', mode:'lines+markers', name:`C${c.cycle} (${c.lado})`, line:{color:cols[i],width:3}, marker:{size:2,color:cols[i]} });
    }
    $('cycle-count-badge').style.display='inline-flex';
    $('cycle-count-badge').textContent=`${en.length} ciclos`;
  } else {
    traces.push({ x:state.dp.AmBx.map(v=>v*xm), y:state.dp.AmBz, z:state.dp.AmBy.map(v=>v*ym), type:'scatter3d', mode:'lines', line:{color:'#4f46e5',width:2}, name:'Trayectoria' });
    $('cycle-count-badge').style.display='none';
  }

  const ax = (t) => ({
    title: { text: t, font: { size: 10, color: '#4a5068' } },
    color: '#7c82a0',
    gridcolor: '#e8ecf4',
    backgroundcolor: '#f8f9fc',
    tickfont: { size: 9 },
    showspikes: false,
  });

  Plotly.react('plot-3d', traces, {
    scene: {
      xaxis: ax(`Lateral (${s})`),
      yaxis: ax(`AP (${s})`),
      zaxis: ax(`Vertical (${s})`),
      bgcolor: '#f8f9fc',
      camera: { eye: { x: 1.5, y: 1.5, z: 1.0 } },
    },
    paper_bgcolor: '#ffffff',
    margin: { t: 8, r: 8, b: 8, l: 8 },
    font: { family: 'Inter', color: '#1a1d2e' },
    showlegend: en.length > 0 && en.length <= 15,
    legend: {
      x: 1.02, y: 1, xanchor: 'left',
      bgcolor: 'rgba(255,255,255,0.95)',
      bordercolor: '#d4d9e8', borderwidth: 1,
      font: { size: 9, family: 'Inter' },
      tracegroupgap: 2,
    },
  }, { responsive: true, displaylogo: false });
}

function norm20(xd,yd,zd) {
  const n=xd.length,pts=20,x=[],y=[],z=[];
  for(let i=0;i<pts;i++){const f=i/(pts-1),idx=f*(n-1),lo=Math.floor(idx),hi=Math.min(lo+1,n-1),t=idx-lo;
    x.push(xd[lo]*(1-t)+xd[hi]*t);y.push(yd[lo]*(1-t)+yd[hi]*t);z.push(zd[lo]*(1-t)+zd[hi]*t);}
  return{x,y,z};
}

function palette(n) {
  const c=['#4f46e5','#e11d48','#059669','#d97706','#7c3aed','#0891b2','#db2777','#0ea5e9','#ea580c','#8b5cf6','#0d9488','#65a30d','#be123c','#6366f1','#ca8a04','#c026d3','#2563eb','#16a34a','#dc2626','#0284c7'];
  return Array.from({length:n},(_,i)=>c[i%c.length]);
}

// ── CYCLES ──
function runAutoCycles() {
  if (!state.dp.dataRead) return;
  log('Detectando ciclos masticatorios...', 'var(--indigo)');
  state.cycles = detectCycles(state.dp, { prominence: state.unit==='mm'?1:1000, minVerticalMm: state.unit==='mm'?2:2000 });
  if (!state.cycles.length) { log('No se detectaron ciclos válidos.', 'var(--rose)'); return; }
  const en=state.cycles.filter(c=>c.enabled), nI=en.filter(c=>c.lado==='Izq').length, nD=en.filter(c=>c.lado==='Der').length;
  log(`${state.cycles.length} ciclos detectados — Izq: ${nI} — Der: ${nD}`, 'var(--emerald)');
  updateCards(en,nI,nD);
  $('cycle-section').style.display='block';
  $('summary-cards').style.display='grid';
  populateTable(); update2D(); update3D();
}

function updateCards(en,nI,nD) {
  $('val-cycles').textContent=en.length;
  $('val-laterality').textContent=`${nI}I / ${nD}D`;
  $('val-duration').textContent=`${Math.round(en.reduce((s,c)=>s+c.dur_ms,0)/en.length)} ms`;
  $('val-vertical').textContent=`${(en.reduce((s,c)=>s+c.max_vert,0)/en.length).toFixed(2)} ${state.unit}`;
}

// ── TABLE ──
function populateTable() {
  const s = state.unit, thead = $('cycle-thead'), tbody = $('cycle-tbody');
  const headers = [
    '', '#', 'Lado', 'Dur (ms)', 'T.Aper (ms)', 'T.Cier (ms)',
    `V.Aper (${s}/s)`, `V.Cier (${s}/s)`, `V.Prom (${s}/s)`, `V.Max (${s}/s)`,
    `Dist X (${s})`, `Dist Y (${s})`, `Dist Z (${s})`, `Dist 3D (${s})`,
    `Max Vert (${s})`, `Max Horiz (${s})`, `Max Sag (${s})`,
    `Vert Min`, `Vert Max`, `Lat Min`, `Lat Max`,
    `AP Min`, `AP Max`, `Hipot (${s})`,
    `VelV Max`, `VelL Max`, `VelAP Max`,
    `Work Exc (${s})`, `Bal Exc (${s})`, '% Artef'
  ];
  thead.innerHTML = headers.map(h => `<th>${h}</th>`).join('');
  tbody.innerHTML = '';

  for (let i = 0; i < state.cycles.length; i++) {
    const c = state.cycles[i];
    const tr = document.createElement('tr');
    if (!c.enabled) tr.classList.add('disabled');

    // Color-code the laterality
    const ladoCls = c.lado === 'Izq' ? 'lado-izq' : c.lado === 'Der' ? 'lado-der' : 'lado-centro';

    // Use palette color for the cycle number
    const cycleColor = palette(state.cycles.length)[i];

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
      <td style="color:${cycleColor};font-weight:700">C${c.cycle}</td>
      <td class="${ladoCls}">${c.lado}</td>
      ${nums.map(([v, d]) => `<td>${rd(v, d)}</td>`).join('')}
    `;
    tbody.appendChild(tr);
  }

  tbody.querySelectorAll('.cycle-cb').forEach(cb => {
    cb.addEventListener('change', e => {
      const idx = parseInt(e.target.dataset.idx);
      state.cycles[idx].enabled = e.target.checked;
      e.target.closest('tr').classList.toggle('disabled', !e.target.checked);
      update2D(); update3D(); refreshCards();
    });
  });
}

function setAllCycles(v) { state.cycles.forEach(c=>c.enabled=v); populateTable(); update2D(); update3D(); refreshCards(); }

function refreshCards() {
  const en=state.cycles.filter(c=>c.enabled);
  if(en.length) updateCards(en,en.filter(c=>c.lado==='Izq').length,en.filter(c=>c.lado==='Der').length);
}

// ── FILTERS ──
const FLDS=[
  {group:'Tiempos',fields:[{key:'dur_ms',label:'Duración total (ms)',min:100,max:5000},{key:'t_opening',label:'T. Apertura (ms)',min:0,max:5000},{key:'t_closing',label:'T. Cierre (ms)',min:0,max:5000}]},
  {group:'Distancias',fields:[{key:'max_vert',label:'Rango Vertical',min:0,max:99999},{key:'max_horiz',label:'Rango Lateral',min:0,max:99999},{key:'max_sagit',label:'Rango AP',min:0,max:99999},{key:'dist_3d',label:'Dist Total 3D',min:0,max:99999},{key:'hypotenuse',label:'Hipotenusa',min:0,max:99999}]},
  {group:'Velocidades',fields:[{key:'vel_vert_max',label:'Vel Vert Max',min:0,max:99999},{key:'vel_lat_max',label:'Vel Lat Max',min:0,max:99999},{key:'vel_ap_max',label:'Vel AP Max',min:0,max:99999},{key:'vel_max',label:'Vel 3D Max',min:0,max:99999}]},
];

function openFilterModal() {
  if(!state.cycles.length){log('Ejecute Auto Ciclos primero.','var(--rose)');return;}
  const c=$('filter-fields'); c.innerHTML='';
  for(const g of FLDS){
    const t=document.createElement('div');t.className='filter-group-title';t.textContent=g.group;c.appendChild(t);
    for(const f of g.fields){
      const sv=state.lastFilters[f.key], r=document.createElement('div');r.className='filter-row';
      r.innerHTML=`<label>${f.label}:</label><input type="number" data-key="${f.key}" data-role="min" step="0.1" value="${sv?sv.min:f.min}" placeholder="Min"><input type="number" data-key="${f.key}" data-role="max" step="0.1" value="${sv?sv.max:f.max}" placeholder="Max">`;
      c.appendChild(r);
    }
  }
  $('filter-modal').style.display='flex';
}

function applyFilterModal() {
  const inp=$('filter-fields').querySelectorAll('input[data-key]'), filt={};
  inp.forEach(i=>{const k=i.dataset.key;if(!filt[k])filt[k]={};filt[k][i.dataset.role]=parseFloat(i.value)||0;});
  state.lastFilters={};
  for(const[k,v]of Object.entries(filt)) state.lastFilters[k]={min:v.min||0,max:v.max||99999};
  const disc=applyFilters(state.cycles,state.lastFilters);
  log(`Filtros aplicados: ${disc} ciclos descartados`,'var(--violet)');
  populateTable(); update2D(); update3D(); refreshCards();
  $('filter-modal').style.display='none';
}

function onProfileChange(e) {
  const inp=$('filter-fields').querySelectorAll('input[data-key]');
  if(e.target.value==='adulto'){sfv(inp,'dur_ms','min',200);sfv(inp,'dur_ms','max',2000);sfv(inp,'max_vert','min',2);}
  else if(e.target.value==='pediatrico'){sfv(inp,'dur_ms','min',150);sfv(inp,'dur_ms','max',2500);sfv(inp,'max_vert','min',1);}
}
function sfv(inp,key,role,val){for(const i of inp)if(i.dataset.key===key&&i.dataset.role===role){i.value=val;break;}}

// ── STATS ──
function toggleStats() {
  state.showStats=!state.showStats;
  const ex=document.querySelector('.stats-overlay');
  if(ex){ex.remove();return;}
  if(!state.showStats||!state.cycles.length)return;
  const en=state.cycles.filter(c=>c.enabled);if(!en.length)return;
  const avg=k=>en.reduce((s,c)=>s+(c[k]||0),0)/en.length;
  const std=k=>{const m=avg(k);return Math.sqrt(en.reduce((s,c)=>s+((c[k]||0)-m)**2,0)/en.length);};
  const ov=document.createElement('div');ov.className='stats-overlay';
  ov.innerHTML=`<h4>Estadísticas (${en.length} ciclos)</h4>
    <div class="stats-row"><span>Duración:</span><span class="value">${rd(avg('dur_ms'),0)} ±${rd(std('dur_ms'),0)} ms</span></div>
    <div class="stats-row"><span>Vertical:</span><span class="value">${rd(avg('max_vert'),2)} ±${rd(std('max_vert'),2)} ${state.unit}</span></div>
    <div class="stats-row"><span>Lateral:</span><span class="value">${rd(avg('max_horiz'),2)} ±${rd(std('max_horiz'),2)} ${state.unit}</span></div>
    <div class="stats-row"><span>AP:</span><span class="value">${rd(avg('max_sagit'),2)} ±${rd(std('max_sagit'),2)} ${state.unit}</span></div>
    <div class="stats-row"><span>Vel Max:</span><span class="value">${rd(avg('vel_max'),1)} ±${rd(std('vel_max'),1)} ${state.unit}/s</span></div>
    <div class="stats-row"><span>Lateralidad:</span><span class="value">${en.filter(c=>c.lado==='Izq').length}I / ${en.filter(c=>c.lado==='Der').length}D</span></div>`;
  document.querySelector('.plot-card')?.appendChild(ov);
}

// ── VALIDATE ──
function validateArtifacts() {
  if(!state.cycles.length){log('Ejecute Auto Ciclos primero.','var(--rose)');return;}
  log('Validando artefactos...','var(--indigo)');
  const n=state.dp.length;let hf=0;
  for(let i=1;i<n;i++){
    const dAx=state.dp.Ax[i]-state.dp.Ax[i-1],dBx=state.dp.Bx[i]-state.dp.Bx[i-1];
    const dAy=state.dp.Ay[i]-state.dp.Ay[i-1],dBy=state.dp.By[i]-state.dp.By[i-1];
    if(Math.sign(dAx)===Math.sign(dBx)&&Math.sign(dAy)===Math.sign(dBy))
      if(Math.abs(dAx-dBx)<Math.abs(dAx)*0.5&&Math.abs(dAy-dBy)<Math.abs(dAy)*0.5)hf++;
  }
  const rel=((1-hf/n)*100).toFixed(1);
  log(`Confiabilidad: ${rel}% (${hf} frames con mov. cabeza)`,parseFloat(rel)>80?'var(--emerald)':'var(--rose)');
  $('val-reliability').textContent=`${rel}%`;
  for(const c of state.cycles){
    let af=0;
    for(let i=c.sp+1;i<=c.ep;i++){
      const dAy=state.dp.Ay[i]-state.dp.Ay[i-1],dBy=state.dp.By[i]-state.dp.By[i-1];
      if(Math.sign(dAy)===Math.sign(dBy)&&Math.abs(dAy-dBy)<Math.abs(dAy)*0.5)af++;
    }
    c.artifact_pct=(af/(c.ep-c.sp))*100;
  }
  populateTable();
  log('Validación completada.','var(--emerald)');
}

// ── EXPORT / SESSION ──
function handleExportExcel(){if(!state.cycles.length){log('No hay ciclos.','var(--rose)');return;}exportToExcel(state.cycles,state.unit,state.fileName);log('Reporte Excel exportado.','var(--emerald)');}
function handleSaveSession(){exportSession(state.cycles,state.fileName);log('Sesión guardada.','var(--emerald)');}
async function handleLoadSession(e){const f=e.target.files[0];if(!f)return;try{const s=await importSession(f);state.cycles=s.cycles;state.fileName=s.fileName||'sesion';$('hero-empty').style.display='none';$('workspace').style.display='flex';$('summary-cards').style.display='grid';$('cycle-section').style.display='block';log(`Sesión restaurada: ${f.name} — ${state.cycles.length} ciclos`,'var(--emerald)');populateTable();refreshCards();}catch(err){log(`Error: ${err.message}`,'var(--rose)');}$('session-input').value='';}

// ── LOG ──
function log(msg,color='var(--text-3)'){
  const out=$('log-output'),time=new Date().toLocaleTimeString('es',{hour12:false});
  const e=document.createElement('div');e.className='log-entry';
  e.innerHTML=`<span class="log-time">[${time}]</span><span style="color:${color}">${msg}</span>`;
  out.appendChild(e);out.scrollTop=out.scrollHeight;
}

function rd(v,d){if(v==null||isNaN(v))return'—';const f=10**d;return Math.round(v*f)/f;}
