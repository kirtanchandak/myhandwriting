export type Gray = { width: number; height: number; data: Uint8Array };

export function rgbaToGray(rgba: ArrayLike<number>, width: number, height: number): Gray {
  const data = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < data.length; i++, p += 4) {
    data[i] = (rgba[p] * 299 + rgba[p + 1] * 587 + rgba[p + 2] * 114) / 1000;
  }
  return { width, height, data };
}

/** How much darker each pixel is than the mean of its (2r+1)^2 neighbourhood, clamped to 0..255. */
export function localContrast(g: Gray, radius: number): Uint8Array {
  const { width: w, height: h, data } = g;
  const iw = w + 1;
  const integral = new Float64Array(iw * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += data[y * w + x];
      integral[(y + 1) * iw + x + 1] = integral[y * iw + x + 1] + row;
    }
  }
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(h, y + radius + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(w, x + radius + 1);
      const sum = integral[y1 * iw + x1] - integral[y0 * iw + x1] - integral[y1 * iw + x0] + integral[y0 * iw + x0];
      const mean = sum / ((y1 - y0) * (x1 - x0));
      const d = mean - data[y * w + x];
      out[y * w + x] = d <= 0 ? 0 : d >= 255 ? 255 : d;
    }
  }
  return out;
}

export function threshold(values: Uint8Array, t: number): Uint8Array {
  const out = new Uint8Array(values.length);
  for (let i = 0; i < values.length; i++) out[i] = values[i] > t ? 1 : 0;
  return out;
}

/**
 * Rotates content so that lines with slope tan(angle) in the source become horizontal.
 * Same output size; uncovered corners are filled white.
 */
export function deskew(src: Gray, angle: number): Gray {
  const { width: w, height: h, data } = src;
  const out = new Uint8Array(w * h).fill(255);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const cx = w / 2;
  const cy = h / 2;
  for (let y = 0; y < h; y++) {
    const dy = y - cy;
    for (let x = 0; x < w; x++) {
      const dx = x - cx;
      const sx = cx + dx * cos - dy * sin;
      const sy = cy + dx * sin + dy * cos;
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      if (x0 < 0 || y0 < 0 || x0 >= w - 1 || y0 >= h - 1) continue;
      const fx = sx - x0;
      const fy = sy - y0;
      const i = y0 * w + x0;
      const top = data[i] * (1 - fx) + data[i + 1] * fx;
      const bottom = data[i + w] * (1 - fx) + data[i + w + 1] * fx;
      out[y * w + x] = top * (1 - fy) + bottom * fy;
    }
  }
  return { width: w, height: h, data: out };
}

/** Angle (radians) of the dominant near-horizontal structure: ruled lines and text rows. */
export function estimateSkew(mask: Uint8Array, w: number, h: number, maxDeg = 6): number {
  const xs: number[] = [];
  const ys: number[] = [];
  const step = Math.max(1, Math.round(Math.sqrt((w * h) / 400_000)));
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      if (mask[y * w + x]) {
        xs.push(x);
        ys.push(y);
      }
    }
  }
  if (xs.length < 50) return 0;
  const offset = w * Math.tan((maxDeg * Math.PI) / 180) + 1;
  const bins = new Float64Array(Math.ceil(h + 2 * offset) + 2);
  const score = (deg: number) => {
    const t = Math.tan((deg * Math.PI) / 180);
    bins.fill(0);
    for (let i = 0; i < xs.length; i++) bins[Math.round(ys[i] - xs[i] * t + offset)]++;
    let s = 0;
    for (let i = 0; i < bins.length; i++) s += bins[i] * bins[i];
    return s;
  };
  let best = 0;
  let bestScore = -1;
  for (let deg = -maxDeg; deg <= maxDeg + 1e-9; deg += 0.25) {
    const s = score(deg);
    if (s > bestScore) [best, bestScore] = [deg, s];
  }
  const coarse = best;
  for (let deg = coarse - 0.25; deg <= coarse + 0.25 + 1e-9; deg += 0.05) {
    const s = score(deg);
    if (s > bestScore) [best, bestScore] = [deg, s];
  }
  return (best * Math.PI) / 180;
}

export type Bounds = { x0: number; y0: number; x1: number; y1: number };

/** Otsu threshold of a grayscale image. */
export function otsu(g: Gray): number {
  const hist = new Float64Array(256);
  for (let i = 0; i < g.data.length; i += 2) hist[g.data[i]]++;
  let total = 0;
  let sum = 0;
  for (let i = 0; i < 256; i++) {
    total += hist[i];
    sum += i * hist[i];
  }
  let wB = 0;
  let sumB = 0;
  let best = 127;
  let bestVar = -1;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const v = wB * wF * (mB - mF) ** 2;
    if (v > bestVar) [best, bestVar] = [t, v];
  }
  return best;
}

/**
 * Bounding box of the bright paper against a darker background. Returns the
 * full image when no clear background is visible.
 */
export function paperBounds(g: Gray): Bounds {
  const { width: w, height: h, data } = g;
  const full = { x0: 0, y0: 0, x1: w - 1, y1: h - 1 };
  const t = otsu(g);
  let dark = 0;
  for (let i = 0; i < data.length; i += 4) if (data[i] <= t) dark++;
  const darkFrac = dark / (data.length / 4);
  // Ink alone covers a few percent; a visible table or floor covers much more.
  if (darkFrac < 0.04 || darkFrac > 0.6) return full;
  const rows = new Float64Array(h);
  const cols = new Float64Array(w);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[y * w + x] > t) {
        rows[y]++;
        cols[x]++;
      }
    }
  }
  const first = (arr: Float64Array, n: number, need: number) => {
    for (let i = 0; i < arr.length; i++) if (arr[i] > need * n) return i;
    return 0;
  };
  const last = (arr: Float64Array, n: number, need: number) => {
    for (let i = arr.length - 1; i >= 0; i--) if (arr[i] > need * n) return i;
    return arr.length - 1;
  };
  return {
    x0: first(cols, h, 0.6),
    x1: last(cols, h, 0.6),
    y0: first(rows, w, 0.6),
    y1: last(rows, w, 0.6),
  };
}

export function percentile(values: ArrayLike<number>, p: number): number {
  if (values.length === 0) return 0;
  const sorted = Array.from(values).sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)))];
}

export const median = (values: ArrayLike<number>) => percentile(values, 0.5);
