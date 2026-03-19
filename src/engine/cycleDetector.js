/**
 * Cycle Detector — Port of auto_detectar_ciclos from Python
 * Detects chewing cycles from vertical (Y) signal using valley detection
 */

/**
 * Detect valleys in a 1D signal
 * @param {number[]} signal
 * @param {number} prominence - minimum prominence for valley detection
 * @param {number} distance - minimum distance between valleys
 * @returns {number[]} indices of valleys
 */
export function findValleys(signal, prominence = 0.5, distance = 3) {
  const n = signal.length;
  if (n < 3) return [];

  // Find all local minima
  const candidates = [];
  for (let i = 1; i < n - 1; i++) {
    if (signal[i] <= signal[i - 1] && signal[i] <= signal[i + 1]) {
      candidates.push(i);
    }
  }

  // Filter by prominence
  const valleys = [];
  for (const idx of candidates) {
    // Left prominence
    let leftMax = signal[idx];
    for (let j = idx - 1; j >= 0; j--) {
      if (signal[j] > leftMax) leftMax = signal[j];
    }
    // Right prominence
    let rightMax = signal[idx];
    for (let j = idx + 1; j < n; j++) {
      if (signal[j] > rightMax) rightMax = signal[j];
    }
    const prom = Math.min(leftMax, rightMax) - signal[idx];
    if (prom >= prominence) {
      valleys.push({ idx, prominence: prom });
    }
  }

  // Filter by distance (keep most prominent when too close)
  valleys.sort((a, b) => a.idx - b.idx);
  const filtered = [];
  for (let i = 0; i < valleys.length; i++) {
    if (filtered.length === 0 || valleys[i].idx - filtered[filtered.length - 1].idx >= distance) {
      filtered.push(valleys[i]);
    } else if (valleys[i].prominence > filtered[filtered.length - 1].prominence) {
      filtered[filtered.length - 1] = valleys[i];
    }
  }

  return filtered.map(v => v.idx);
}

/**
 * Detect chewing cycles and compute all metrics
 * @param {import('./dataProcessor.js').DataProcessor} dp - data processor instance
 * @param {object} options
 * @returns {object[]} array of cycle data objects
 */
export function detectCycles(dp, options = {}) {
  const {
    prominence = 1.0,
    minDistance = 3,
    minDurationMs = 200,
    maxDurationMs = 2000,
    minVerticalMm = 2.0,
  } = options;

  const yData = dp.AmBy;
  const xData = dp.AmBx;
  const zData = dp.AmBz;
  const time = dp.Tiempo;
  const n = yData.length;

  // Find valleys in Y (vertical axis — occlusion points)
  const valleys = findValleys(yData, prominence, minDistance);
  if (valleys.length < 2) return [];

  const cycles = [];
  let cycleNum = 0;

  for (let i = 0; i < valleys.length - 1; i++) {
    const sp = valleys[i];
    const ep = valleys[i + 1];
    const dur_s = time[ep] - time[sp];
    const dur_ms = dur_s * 1000;

    // ── Paper-based pre-filtering ──
    if (dur_ms < minDurationMs || dur_ms > maxDurationMs) continue;

    // Segment data
    const segX = xData.slice(sp, ep + 1);
    const segY = yData.slice(sp, ep + 1);
    const segZ = zData.slice(sp, ep + 1);

    // Vertical excursion
    const yMin = Math.min(...segY);
    const yMax = Math.max(...segY);
    const vertRange = yMax - yMin;
    if (vertRange < minVerticalMm) continue;

    // Find peak opening (max gape = max Y in segment)
    let peakIdx = 0;
    for (let j = 1; j < segY.length; j++) {
      if (segY[j] > segY[peakIdx]) peakIdx = j;
    }

    // Opening/closing times
    const tOpening = (time[sp + peakIdx] - time[sp]) * 1000;
    const tClosing = (time[ep] - time[sp + peakIdx]) * 1000;
    if (tOpening >= dur_ms) continue; // Opening > total = invalid

    cycleNum++;

    // ── Laterality: X displacement at peak opening ──
    const xAtPeak = segX[peakIdx] - segX[0];
    let lado = 'Centro';
    if (xAtPeak > 0.3) lado = 'Der';
    else if (xAtPeak < -0.3) lado = 'Izq';

    // ── Excursions ──
    const xMin = Math.min(...segX);
    const xMax = Math.max(...segX);
    const zMin = Math.min(...segZ);
    const zMax = Math.max(...segZ);

    const horizRange = xMax - xMin;
    const sagitRange = zMax - zMin;

    // Working/balancing excursions
    let workingExc = 0, balancingExc = 0;
    const x0 = segX[0];
    if (lado === 'Der') {
      workingExc = Math.max(...segX.map(v => v - x0));
      balancingExc = Math.abs(Math.min(...segX.map(v => v - x0)));
    } else if (lado === 'Izq') {
      workingExc = Math.abs(Math.min(...segX.map(v => v - x0)));
      balancingExc = Math.max(...segX.map(v => v - x0));
    }

    // ── Distances ──
    const distX = Math.abs(segX[segX.length - 1] - segX[0]);
    const distY = Math.abs(segY[segY.length - 1] - segY[0]);
    const distZ = Math.abs(segZ[segZ.length - 1] - segZ[0]);

    let dist3d = 0;
    for (let j = 1; j < segX.length; j++) {
      const dx = segX[j] - segX[j - 1];
      const dy = segY[j] - segY[j - 1];
      const dz = segZ[j] - segZ[j - 1];
      dist3d += Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    const hypotenuse = Math.sqrt(
      (segX[segX.length - 1] - segX[0]) ** 2 +
      (segY[segY.length - 1] - segY[0]) ** 2 +
      (segZ[segZ.length - 1] - segZ[0]) ** 2
    );

    // ── Velocities ──
    const vx = dp.d1AmBx.slice(sp, ep + 1);
    const vy = dp.d1AmBy.slice(sp, ep + 1);
    const vz = dp.d1AmBz.slice(sp, ep + 1);

    const velVertMax = Math.max(...vy.map(Math.abs));
    const velLatMax = Math.max(...vx.map(Math.abs));
    const velApMax = Math.max(...vz.map(Math.abs));

    const vel3d = vx.map((_, j) => Math.sqrt(vx[j] ** 2 + vy[j] ** 2 + vz[j] ** 2));
    const velMax = Math.max(...vel3d);
    const velAvg = vel3d.reduce((a, b) => a + b, 0) / vel3d.length;

    const velOpening = peakIdx > 0 ? vertRange / (tOpening / 1000) : 0;
    const velClosing = (segY.length - peakIdx - 1) > 0 ? vertRange / (tClosing / 1000) : 0;

    // Occlusion point
    const occX = segX[0];
    const occY = segY[0];
    const occZ = segZ[0];

    cycles.push({
      cycle: cycleNum,
      enabled: true,
      sp, ep,
      dur_ms: Math.round(dur_ms),
      t_opening: Math.round(tOpening),
      t_closing: Math.round(tClosing),
      lado,
      // Distances
      dist_x: distX, dist_y: distY, dist_z: distZ,
      dist_3d: dist3d,
      hypotenuse,
      // Excursions
      max_vert: vertRange,
      max_horiz: horizRange,
      max_sagit: sagitRange,
      vert_min: yMin, vert_max: yMax,
      lat_min: xMin, lat_max: xMax,
      ap_min: zMin, ap_max: zMax,
      // Velocities
      vel_opening: velOpening,
      vel_closing: velClosing,
      vel_avg: velAvg,
      vel_max: velMax,
      vel_vert_max: velVertMax,
      vel_lat_max: velLatMax,
      vel_ap_max: velApMax,
      // Excursions
      working_excursion: workingExc,
      balancing_excursion: balancingExc,
      // Occlusion reference
      occlusion_x: occX, occlusion_y: occY, occlusion_z: occZ,
      // Artifact
      artifact_pct: 0,
    });
  }

  return cycles;
}

/**
 * Apply configurable filters to cycles
 */
export function applyFilters(cycles, filters) {
  let discarded = 0;
  for (const c of cycles) {
    let passes = true;
    for (const [key, { min, max }] of Object.entries(filters)) {
      const val = c[key] || 0;
      if (min > 0 && val < min) { passes = false; break; }
      if (max < 99999 && val > max) { passes = false; break; }
    }
    if (!passes) {
      c.enabled = false;
      discarded++;
    }
  }
  return discarded;
}
