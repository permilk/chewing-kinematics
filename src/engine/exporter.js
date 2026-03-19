/**
 * Excel Exporter — Uses SheetJS to create backward-compatible Excel reports
 */
import * as XLSX from 'xlsx';

/**
 * Export cycles to Excel workbook
 * @param {object[]} cycles - cycle data array
 * @param {string} unit - unit symbol (mm, µm)
 * @param {string} fileName - original data file name
 */
export function exportToExcel(cycles, unit = 'mm', fileName = 'data') {
  const s = unit;
  const rows = cycles.map(c => ({
    'Ciclo': `C${c.cycle}`,
    'Estado': c.enabled ? 'Activo' : 'Descartado',
    'Lado': c.lado || '?',
    [`Duracion (ms)`]: Math.round(c.dur_ms),
    [`T.Apertura (ms)`]: Math.round(c.t_opening),
    [`T.Cierre (ms)`]: Math.round(c.t_closing),
    [`V.Apertura (${s}/s)`]: round(c.vel_opening, 2),
    [`V.Cierre (${s}/s)`]: round(c.vel_closing, 2),
    [`V.Prom (${s}/s)`]: round(c.vel_avg, 2),
    [`V.Max (${s}/s)`]: round(c.vel_max, 2),
    [`Dist X (${s})`]: round(c.dist_x, 4),
    [`Dist Y (${s})`]: round(c.dist_y, 4),
    [`Dist Z (${s})`]: round(c.dist_z, 4),
    [`Dist 3D (${s})`]: round(c.dist_3d, 4),
    [`Max Vertical (${s})`]: round(c.max_vert, 4),
    [`Max Horizontal (${s})`]: round(c.max_horiz, 4),
    [`Max Sagital (${s})`]: round(c.max_sagit, 4),
    [`Vert Min (${s})`]: round(c.vert_min, 4),
    [`Vert Max (${s})`]: round(c.vert_max, 4),
    [`Lat Min (${s})`]: round(c.lat_min, 4),
    [`Lat Max (${s})`]: round(c.lat_max, 4),
    [`AP Min (${s})`]: round(c.ap_min, 4),
    [`AP Max (${s})`]: round(c.ap_max, 4),
    [`Hipotenusa (${s})`]: round(c.hypotenuse, 4),
    [`Vel V.Max (${s}/s)`]: round(c.vel_vert_max, 2),
    [`Vel L.Max (${s}/s)`]: round(c.vel_lat_max, 2),
    [`Vel AP.Max (${s}/s)`]: round(c.vel_ap_max, 2),
    [`Working Excursion (${s})`]: round(c.working_excursion, 4),
    [`Balancing Excursion (${s})`]: round(c.balancing_excursion, 4),
    [`Oclusion X (${s})`]: round(c.occlusion_x, 4),
    [`Oclusion Y (${s})`]: round(c.occlusion_y, 4),
    [`Oclusion Z (${s})`]: round(c.occlusion_z, 4),
    '% Artefacto': round(c.artifact_pct, 1),
    'Frame Inicio': c.sp,
    'Frame Fin': c.ep,
  }));

  // Add averages row for active cycles
  const enabled = cycles.filter(c => c.enabled);
  if (enabled.length > 0) {
    const avg = (key) => round(enabled.reduce((sum, c) => sum + (c[key] || 0), 0) / enabled.length, 4);
    const nIzq = enabled.filter(c => c.lado === 'Izq').length;
    const nDer = enabled.filter(c => c.lado === 'Der').length;
    rows.push({
      'Ciclo': 'PROMEDIO',
      'Estado': `${enabled.length} activos`,
      'Lado': `${nIzq}I / ${nDer}D`,
      [`Duracion (ms)`]: Math.round(avg('dur_ms')),
      [`T.Apertura (ms)`]: Math.round(avg('t_opening')),
      [`T.Cierre (ms)`]: Math.round(avg('t_closing')),
      [`V.Apertura (${s}/s)`]: round(avg('vel_opening'), 2),
      [`V.Cierre (${s}/s)`]: round(avg('vel_closing'), 2),
      [`V.Prom (${s}/s)`]: round(avg('vel_avg'), 2),
      [`V.Max (${s}/s)`]: round(avg('vel_max'), 2),
      [`Dist X (${s})`]: avg('dist_x'),
      [`Dist Y (${s})`]: avg('dist_y'),
      [`Dist Z (${s})`]: avg('dist_z'),
      [`Dist 3D (${s})`]: avg('dist_3d'),
      [`Max Vertical (${s})`]: avg('max_vert'),
      [`Max Horizontal (${s})`]: avg('max_horiz'),
      [`Max Sagital (${s})`]: avg('max_sagit'),
      [`Vert Min (${s})`]: avg('vert_min'),
      [`Vert Max (${s})`]: avg('vert_max'),
      [`Lat Min (${s})`]: avg('lat_min'),
      [`Lat Max (${s})`]: avg('lat_max'),
      [`AP Min (${s})`]: avg('ap_min'),
      [`AP Max (${s})`]: avg('ap_max'),
      [`Hipotenusa (${s})`]: avg('hypotenuse'),
      [`Vel V.Max (${s}/s)`]: round(avg('vel_vert_max'), 2),
      [`Vel L.Max (${s}/s)`]: round(avg('vel_lat_max'), 2),
      [`Vel AP.Max (${s}/s)`]: round(avg('vel_ap_max'), 2),
      [`Working Excursion (${s})`]: avg('working_excursion'),
      [`Balancing Excursion (${s})`]: avg('balancing_excursion'),
    });
  }

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Ciclos Masticatorios');

  // Download
  const dateStr = new Date().toISOString().slice(0, 10);
  const outName = `reporte_clinico_${dateStr}_${fileName.replace(/\.[^.]+$/, '')}_${s}.xlsx`;
  XLSX.writeFile(wb, outName);
}

/**
 * Export session as JSON download
 */
export function exportSession(cycles, fileName) {
  const session = { fileName, cycles, timestamp: new Date().toISOString() };
  const blob = new Blob([JSON.stringify(session, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${fileName.replace(/\.[^.]+$/, '')}_sesion.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

/**
 * Import session from JSON file
 */
export function importSession(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        resolve(JSON.parse(e.target.result));
      } catch (err) {
        reject(new Error('Archivo de sesión inválido'));
      }
    };
    reader.onerror = () => reject(new Error('Error leyendo archivo'));
    reader.readAsText(file);
  });
}

function round(v, d) {
  const f = 10 ** d;
  return Math.round((v || 0) * f) / f;
}
