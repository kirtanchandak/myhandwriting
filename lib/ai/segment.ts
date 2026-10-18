import type { LineInk, ScannedGlyph } from "@/lib/scan/scanPage";
import { labelComponents } from "@/lib/scan/components";

export type Slot = { char: string; variant: number };

export type Range = { x0: number; x1: number; y0: number; y1: number };

/**
 * Cuts a flagged line into one glyph per character. Wide blobs are split at
 * the narrowest column of ink, which is where two touching letters meet.
 * Returns null when the ink cannot be divided into exactly `slots.length` pieces.
 */
export function segmentLine(
  crop: LineInk,
  slots: Slot[],
  lineNumber: number,
  idPrefix: string,
): ScannedGlyph[] | null {
  const ranges = fitRanges(crop, slots.length);
  if (!ranges) return null;
  return ranges.map((range, i) => glyphFromRange(crop, range, slots[i], lineNumber, `${idPrefix}:${i}`));
}

function fitRanges(crop: LineInk, count: number): Range[] | null {
  const ranges = initialRanges(crop);
  if (ranges.length === 0 || ranges.length > count * 3) return null;
  let guard = count + 4;
  while (ranges.length < count && guard-- > 0) {
    if (!splitWidest(ranges, crop)) return null;
  }
  guard = count + 4;
  while (ranges.length > count && guard-- > 0) {
    if (!mergeClosest(ranges)) return null;
  }
  return ranges.length === count ? ranges : null;
}

function initialRanges(crop: LineInk): Range[] {
  const speck = Math.max(4, Math.round(crop.unit * crop.unit * 0.004));
  const { components } = labelComponents(crop.ink, crop.width, crop.height);
  const kept = components.filter((c) => c.area >= speck).sort((a, b) => a.x0 - b.x0);
  const ranges: Range[] = [];
  const touch = crop.unit * 0.03;
  for (const c of kept) {
    const last = ranges.at(-1);
    if (last && c.x0 <= last.x1 + touch) {
      last.x1 = Math.max(last.x1, c.x1);
      last.y0 = Math.min(last.y0, c.y0);
      last.y1 = Math.max(last.y1, c.y1);
    } else {
      ranges.push({ x0: c.x0, x1: c.x1, y0: c.y0, y1: c.y1 });
    }
  }
  return ranges;
}

function splitWidest(ranges: Range[], crop: LineInk): boolean {
  let i = 0;
  for (let k = 1; k < ranges.length; k++) {
    if (ranges[k].x1 - ranges[k].x0 > ranges[i].x1 - ranges[i].x0) i = k;
  }
  const range = ranges[i];
  const width = range.x1 - range.x0 + 1;
  const margin = Math.max(2, Math.floor(width * 0.18));
  if (width < margin * 2 + 3) return false;
  const cols = new Uint16Array(width);
  for (let y = range.y0; y <= range.y1; y++) {
    for (let x = range.x0; x <= range.x1; x++) {
      if (crop.ink[y * crop.width + x]) cols[x - range.x0]++;
    }
  }
  let peak = 0;
  for (const n of cols) if (n > peak) peak = n;
  let valleyAt = -1;
  let valley = peak;
  for (let x = margin; x < width - margin; x++) {
    if (cols[x] < valley) {
      valley = cols[x];
      valleyAt = x;
    }
  }
  if (valleyAt < 0 || valley > peak * 0.45) return false;
  const cut = range.x0 + valleyAt;
  const left = bounds(crop, range.x0, cut, range.y0, range.y1);
  const right = bounds(crop, cut + 1, range.x1, range.y0, range.y1);
  if (!left || !right) return false;
  ranges.splice(i, 1, left, right);
  return true;
}

function bounds(crop: LineInk, x0: number, x1: number, y0: number, y1: number): Range | null {
  let nx0 = x1;
  let nx1 = x0;
  let ny0 = y1;
  let ny1 = y0;
  let any = false;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (!crop.ink[y * crop.width + x]) continue;
      any = true;
      if (x < nx0) nx0 = x;
      if (x > nx1) nx1 = x;
      if (y < ny0) ny0 = y;
      if (y > ny1) ny1 = y;
    }
  }
  return any ? { x0: nx0, x1: nx1, y0: ny0, y1: ny1 } : null;
}

function mergeClosest(ranges: Range[]): boolean {
  if (ranges.length < 2) return false;
  let best = 0;
  let gap = Infinity;
  for (let i = 0; i < ranges.length - 1; i++) {
    const g = ranges[i + 1].x0 - ranges[i].x1;
    if (g < gap) {
      gap = g;
      best = i;
    }
  }
  const a = ranges[best];
  const b = ranges[best + 1];
  ranges.splice(best, 2, {
    x0: Math.min(a.x0, b.x0),
    x1: Math.max(a.x1, b.x1),
    y0: Math.min(a.y0, b.y0),
    y1: Math.max(a.y1, b.y1),
  });
  return true;
}

export function glyphFromRange(crop: LineInk, range: Range, slot: Slot, lineNumber: number, id: string): ScannedGlyph {
  const pad = 1;
  const x0 = Math.max(0, range.x0 - pad);
  const y0 = Math.max(0, range.y0 - pad);
  const x1 = Math.min(crop.width - 1, range.x1 + pad);
  const y1 = Math.min(crop.height - 1, range.y1 + pad);
  const width = x1 - x0 + 1;
  const height = y1 - y0 + 1;
  const data = new Uint8Array(width * height);
  const alpha = (c: number) => Math.min(255, Math.round((c / crop.inkRef) * 255));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const src = (y0 + y) * crop.width + (x0 + x);
      if (crop.ink[src]) data[y * width + x] = Math.max(140, alpha(crop.contrast[src]));
    }
  }
  return {
    id,
    char: slot.char,
    variant: slot.variant,
    lineNumber,
    mask: { width, height, data },
    metrics: {
      widthU: width / crop.unit,
      heightU: height / crop.unit,
      topU: (y0 - crop.baselineY) / crop.unit,
    },
  };
}
