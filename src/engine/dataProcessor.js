/**
 * Data Processor — Port of process3Ddata from Python
 * Parses sensor data files, computes A-B differences, derivatives
 */

export class DataProcessor {
  constructor() {
    this.reset();
    this._unitFactor = 1000; // default mm
  }

  reset() {
    this.dataRead = false;
    this.Ax = []; this.Bx = []; this.Ay = []; this.By = []; this.Az = []; this.Bz = [];
    this.AmBx = []; this.AmBy = []; this.AmBz = [];
    this.d1AmBx = []; this.d1AmBy = []; this.d1AmBz = [];
    this.d2AmBx = []; this.d2AmBy = []; this.d2AmBz = [];
    this.d3AmBx = []; this.d3AmBy = []; this.d3AmBz = [];
    this.Tiempo = []; this.TiempoRelativo = []; this.posiciones = [];
    this.ts = 1;
    this.frames = [];
    this.rawLines = [];
    this.fileName = '';
  }

  setUnitFactor(factor) {
    this._unitFactor = factor;
    if (this.dataRead) this.process();
  }

  /**
   * Parse text file content (space-delimited sensor data)
   * Format: frame time M1x M1y M1z M2x M2y M2z
   */
  parseFile(text, fileName = 'data.txt') {
    this.reset();
    this.fileName = fileName;
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) throw new Error('Archivo vacío o inválido');

    this.rawLines = [];
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 8) continue;
      this.rawLines.push({
        frame: parseInt(parts[0]),
        time: parseFloat(parts[1]),
        M1x: parseFloat(parts[2]),
        M1y: parseFloat(parts[3]),
        M1z: parseFloat(parts[4]),
        M2x: parseFloat(parts[5]),
        M2y: parseFloat(parts[6]),
        M2z: parseFloat(parts[7])
      });
    }
    if (this.rawLines.length === 0) throw new Error('No se encontraron datos válidos');
    this.dataRead = true;
    this.process();
    return this;
  }

  process() {
    const f = this._unitFactor;
    const n = this.rawLines.length;
    const tf = 3; // median filter size

    // Extract raw arrays and apply unit conversion + median filter
    let rawAx = [], rawAy = [], rawAz = [], rawBx = [], rawBy = [], rawBz = [];
    this.frames = []; this.Tiempo = [];

    for (let i = 0; i < n; i++) {
      const r = this.rawLines[i];
      this.frames.push(r.frame);
      this.Tiempo.push(r.time);
      rawBx.push(r.M1x * f); rawBy.push(r.M1y * f); rawBz.push(r.M1z * f);
      rawAx.push(r.M2x * f); rawAy.push(r.M2y * f); rawAz.push(r.M2z * f);
    }

    this.Bx = medianFilter(rawBx, tf);
    this.Ax = medianFilter(rawAx, tf);
    this.By = medianFilter(rawBy, tf);
    this.Ay = medianFilter(rawAy, tf);
    this.Bz = medianFilter(rawBz, tf);
    this.Az = medianFilter(rawAz, tf);

    // Compute A - B differences
    this.AmBx = this.Ax.map((v, i) => v - this.Bx[i]);
    this.AmBy = this.Ay.map((v, i) => v - this.By[i]);
    this.AmBz = this.Az.map((v, i) => v - this.Bz[i]);

    // Compute time step
    if (n > 1) this.ts = this.Tiempo[1] - this.Tiempo[0];

    // Relative time
    const t0 = this.Tiempo[0];
    this.TiempoRelativo = this.Tiempo.map(t => t - t0);

    // Positions (index array)
    this.posiciones = Array.from({ length: n }, (_, i) => i);

    // Derivatives via central differences
    this.d1AmBx = centralDifference(this.AmBx, this.ts);
    this.d1AmBy = centralDifference(this.AmBy, this.ts);
    this.d1AmBz = centralDifference(this.AmBz, this.ts);

    this.d2AmBx = centralDifference(this.d1AmBx, this.ts);
    this.d2AmBy = centralDifference(this.d1AmBy, this.ts);
    this.d2AmBz = centralDifference(this.d1AmBz, this.ts);

    this.d3AmBx = centralDifference(this.d2AmBx, this.ts);
    this.d3AmBy = centralDifference(this.d2AmBy, this.ts);
    this.d3AmBz = centralDifference(this.d2AmBz, this.ts);
  }

  /** Get total number of frames */
  get length() { return this.rawLines.length; }

  /** Get data for a specific frame range */
  getRange(start, end) {
    return {
      x: this.AmBx.slice(start, end + 1),
      y: this.AmBy.slice(start, end + 1),
      z: this.AmBz.slice(start, end + 1),
      vx: this.d1AmBx.slice(start, end + 1),
      vy: this.d1AmBy.slice(start, end + 1),
      vz: this.d1AmBz.slice(start, end + 1),
    };
  }
}

// ── Utility functions ──

export function medianFilter(data, filterSize) {
  const padSize = Math.floor(filterSize / 2);
  const n = data.length;
  const padded = new Array(n + 2 * padSize);

  // Pad with edge values
  for (let i = 0; i < padSize; i++) padded[i] = data[0];
  for (let i = 0; i < n; i++) padded[i + padSize] = data[i];
  for (let i = 0; i < padSize; i++) padded[n + padSize + i] = data[n - 1];

  const result = new Array(n);
  for (let i = 0; i < n; i++) {
    const window = padded.slice(i, i + filterSize).sort((a, b) => a - b);
    result[i] = window[Math.floor(filterSize / 2)];
  }
  return result;
}

export function centralDifference(signal, dx) {
  const n = signal.length;
  if (n < 3) return new Array(n).fill(0);
  const result = new Array(n);
  result[0] = (signal[1] - signal[0]) / dx;
  for (let i = 1; i < n - 1; i++) {
    result[i] = (signal[i + 1] - signal[i - 1]) / (2 * dx);
  }
  result[n - 1] = (signal[n - 1] - signal[n - 2]) / dx;
  return result;
}

export function smoothArray(arr, windowSize = 7) {
  if (windowSize <= 1) return [...arr];
  const half = Math.floor(windowSize / 2);
  const result = new Array(arr.length);
  for (let i = 0; i < arr.length; i++) {
    let sum = 0, count = 0;
    for (let j = Math.max(0, i - half); j <= Math.min(arr.length - 1, i + half); j++) {
      sum += arr[j];
      count++;
    }
    result[i] = sum / count;
  }
  return result;
}
