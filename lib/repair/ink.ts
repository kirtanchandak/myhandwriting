import type { ScannedGlyph } from "@/lib/scan/scanPage";

export const INK = 140;

/** Pixels per rule unit of a sample. */
export function unitOf(glyph: ScannedGlyph): number {
  return glyph.mask.width / glyph.metrics.widthU;
}

/** Crops a sample to its solid ink, keeping one pixel of soft edge. Returns null when nothing is solid. */
export function tightInk(glyph: ScannedGlyph): ScannedGlyph | null {
  const { width, height, data } = glyph.mask;
  if (!(glyph.metrics.widthU > 0)) return null;
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[y * width + x] < INK) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return null;
  x0 = Math.max(0, x0 - 1);
  y0 = Math.max(0, y0 - 1);
  x1 = Math.min(width - 1, x1 + 1);
  y1 = Math.min(height - 1, y1 + 1);
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const unit = unitOf(glyph);
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) out.set(data.subarray((y + y0) * width + x0, (y + y0) * width + x0 + w), y * w);
  return {
    ...glyph,
    mask: { width: w, height: h, data: out },
    metrics: { ...glyph.metrics, widthU: w / unit, heightU: h / unit, topU: glyph.metrics.topU + y0 / unit },
  };
}

export function median(values: readonly number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
