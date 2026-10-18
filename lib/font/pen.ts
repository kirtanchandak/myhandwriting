import type { GlyphMask, ScannedGlyph } from "@/lib/scan/scanPage";

/**
 * Redraws a scanned letter with one round nib. The ink is thinned to its
 * centre, then filled back out to a steady stroke, the way a ballpoint pen is.
 */
export function penGlyph(glyph: ScannedGlyph): ScannedGlyph {
  const drawn = drawPen(glyph.mask, glyph.metrics.widthU);
  if (!drawn) return glyph;
  const unit = glyph.mask.width / glyph.metrics.widthU;
  return {
    ...glyph,
    mask: drawn.mask,
    metrics: {
      widthU: drawn.mask.width / (unit * drawn.scale),
      heightU: drawn.mask.height / (unit * drawn.scale),
      topU: glyph.metrics.topU - drawn.pad / unit,
    },
  };
}

function drawPen(mask: GlyphMask, widthU: number): { mask: GlyphMask; pad: number; scale: number } | null {
  const { width, height, data } = mask;
  if (width < 2 || height < 2 || !(widthU > 0)) return null;
  const ink = new Uint8Array(width * height);
  for (let i = 0; i < data.length; i++) ink[i] = data[i] >= 140 ? 1 : 0;
  const skeleton = thin(ink, width, height);
  let marks = 0;
  for (const v of skeleton) marks += v;
  if (marks === 0) return null;
  const unit = width / widthU;
  const radius = Math.min(Math.max(1.05, unit * 0.032), Math.min(width, height) * 0.09);
  const pad = Math.ceil(radius);
  const scale = 3;
  const w = (width + pad * 2) * scale;
  const h = (height + pad * 2) * scale;
  const out = new Uint8Array(w * h);
  const rr = radius * scale;
  const r2 = rr * rr;
  const reach = Math.ceil(rr);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!skeleton[y * width + x]) continue;
      const cx = (x + pad) * scale;
      const cy = (y + pad) * scale;
      for (let dy = -reach; dy <= reach; dy++) {
        for (let dx = -reach; dx <= reach; dx++) {
          if (dx * dx + dy * dy > r2) continue;
          const px = cx + dx;
          const py = cy + dy;
          if (px >= 0 && py >= 0 && px < w && py < h) out[py * w + px] = 255;
        }
      }
    }
  }
  return { mask: { width: w, height: h, data: out }, pad, scale };
}

/** Zhang-Suen thinning. Leaves a one-pixel centre line of the ink. */
function thin(src: Uint8Array, w: number, h: number): Uint8Array {
  const img = src.slice();
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : img[y * w + x]);
  let changed = true;
  while (changed) {
    changed = false;
    for (let step = 0; step < 2; step++) {
      const remove: number[] = [];
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (!img[y * w + x]) continue;
          const p = [at(x, y - 1), at(x + 1, y - 1), at(x + 1, y), at(x + 1, y + 1), at(x, y + 1), at(x - 1, y + 1), at(x - 1, y), at(x - 1, y - 1)];
          const neighbours = p.reduce((n, v) => n + v, 0);
          if (neighbours < 2 || neighbours > 6) continue;
          let turns = 0;
          for (let i = 0; i < 8; i++) if (p[i] === 0 && p[(i + 1) % 8] === 1) turns++;
          if (turns !== 1) continue;
          const [p2, , p4, , p6, , p8] = p;
          if (step === 0) {
            if (p2 * p4 * p6 !== 0 || p4 * p6 * p8 !== 0) continue;
          } else if (p2 * p4 * p8 !== 0 || p2 * p6 * p8 !== 0) continue;
          remove.push(y * w + x);
        }
      }
      if (remove.length) changed = true;
      for (const i of remove) img[i] = 0;
    }
  }
  return img;
}
