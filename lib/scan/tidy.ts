import type { ScannedGlyph } from "@/lib/scan/scanPage";
import { labelComponents } from "./components";

const CORE = 140;

/** Letters and digits are never a flat line or wider than a couple of letters. */
export function plausibleGlyph(glyph: ScannedGlyph): boolean {
  if (!/[\p{L}\p{N}]/u.test(glyph.char)) return true;
  return glyph.metrics.heightU >= 0.15 && glyph.metrics.widthU <= 2;
}

export function cleanGlyphs(glyphs: readonly ScannedGlyph[]): ScannedGlyph[] {
  return glyphs.map(tidyGlyph).filter(plausibleGlyph);
}

/**
 * Removes slivers of neighbouring letters caught at the left or right edge of
 * a sample, then trims the box to the remaining ink so spacing stays tight.
 */
export function tidyGlyph(glyph: ScannedGlyph): ScannedGlyph {
  const { width, height, data } = glyph.mask;
  if (width < 3 || height < 3) return glyph;
  const core = new Uint8Array(width * height);
  for (let i = 0; i < data.length; i++) if (data[i] >= CORE) core[i] = 1;
  const { labels, components } = labelComponents(core, width, height);
  if (components.length === 0) return glyph;

  const main = components.reduce((a, b) => (b.area > a.area ? b : a));
  const alnum = /[\p{L}\p{N}]/u.test(glyph.char);
  const drop = new Set<number>();
  for (const c of components) {
    if (c === main) continue;
    if (c.area < 4) {
      drop.add(c.id);
      continue;
    }
    if (!alnum) continue;
    const atEdge = c.x0 <= 1 || c.x1 >= width - 2;
    const w = c.x1 - c.x0 + 1;
    const overlap = Math.max(0, Math.min(c.x1, main.x1) - Math.max(c.x0, main.x0) + 1);
    if (atEdge && overlap < w * 0.5 && w <= width * 0.25 && c.area < main.area * 0.35) drop.add(c.id);
  }

  const keep = new Uint8Array(width * height);
  for (let i = 0; i < labels.length; i++) if (labels[i] && !drop.has(labels[i])) keep[i] = 1;
  const near = (x: number, y: number) => {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < width && ny < height && keep[ny * width + nx]) return true;
      }
    }
    return false;
  };

  let x0 = width;
  let x1 = -1;
  let y0 = height;
  let y1 = -1;
  const cleaned = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (!data[i] || !(keep[i] || (!core[i] && near(x, y)))) continue;
      cleaned[i] = data[i];
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return glyph;

  const pad = 1;
  x0 = Math.max(0, x0 - pad);
  y0 = Math.max(0, y0 - pad);
  x1 = Math.min(width - 1, x1 + pad);
  y1 = Math.min(height - 1, y1 + pad);
  const nw = x1 - x0 + 1;
  const nh = y1 - y0 + 1;
  if (nw === width && nh === height && drop.size === 0) return glyph;
  const out = new Uint8Array(nw * nh);
  for (let y = 0; y < nh; y++) out.set(cleaned.subarray((y0 + y) * width + x0, (y0 + y) * width + x0 + nw), y * nw);

  const unit = width / glyph.metrics.widthU;
  return {
    ...glyph,
    mask: { width: nw, height: nh, data: out },
    metrics: { widthU: nw / unit, heightU: nh / unit, topU: glyph.metrics.topU + y0 / unit },
  };
}
