import type { ScannedGlyph } from "@/lib/scan/scanPage";
import { INK, unitOf } from "./ink";
import type { FontMetrics } from "./metrics";

const ROWS = 32;

/** Distance from each edge of the box to the ink, per row band, in rule units. Infinity where a row has no ink. */
export type Profile = { left: Float64Array; right: Float64Array };

export function sideOf(metrics: FontMetrics): number {
  return metrics.xHeight * 0.06;
}

/** Gives the sample the same small margin on each side of its ink. */
export function sideBearings(glyph: ScannedGlyph, metrics: FontMetrics): ScannedGlyph {
  return { ...glyph, metrics: { ...glyph.metrics, sideU: sideOf(metrics) } };
}

/** Rows run from the cap height down to the descender, so every letter shares them. */
export function profileOf(glyph: ScannedGlyph, metrics: FontMetrics): Profile {
  const left = new Float64Array(ROWS).fill(Infinity);
  const right = new Float64Array(ROWS).fill(Infinity);
  const { width, height, data } = glyph.mask;
  const unit = unitOf(glyph);
  const top = -metrics.capHeight;
  const span = metrics.capHeight + metrics.descender;
  for (let y = 0; y < height; y++) {
    let first = -1;
    let last = -1;
    for (let x = 0; x < width; x++) {
      if (data[y * width + x] < INK) continue;
      if (first < 0) first = x;
      last = x;
    }
    if (first < 0) continue;
    const yU = glyph.metrics.topU + ((y + 0.5) / height) * glyph.metrics.heightU;
    const row = Math.floor(((yU - top) / span) * ROWS);
    if (row < 0 || row >= ROWS) continue;
    left[row] = Math.min(left[row], first / unit);
    right[row] = Math.min(right[row], glyph.metrics.widthU - (last + 1) / unit);
  }
  return { left, right };
}

/**
 * Extra space between two letters, in rule units, on top of their side bearings.
 * Pulls open pairs together so their narrowest gap matches a flat pair, and never
 * lets the closest point shrink below half the usual gap.
 */
export function kernPair(left: Profile, right: Profile, metrics: FontMetrics): number {
  const gaps: number[] = [];
  for (let r = 0; r < ROWS; r++) {
    const g = left.right[r] + right.left[r];
    if (Number.isFinite(g)) gaps.push(g);
  }
  if (gaps.length === 0) return 0;
  const narrowest = Math.min(...gaps);
  const mean = gaps.reduce((s, g) => s + g, 0) / gaps.length;
  const side = sideOf(metrics);
  const kern = -(narrowest + (mean - narrowest) * 0.25);
  const limited = Math.max(kern, -(narrowest + side), -metrics.xHeight * 0.35);
  return limited < 0 ? limited : 0;
}

/** Kerning for every pair of samples, worked out once per pair. */
export function kerning(glyphs: readonly ScannedGlyph[], metrics: FontMetrics) {
  const profiles = new Map(glyphs.map((g) => [g.id, profileOf(g, metrics)]));
  const cache = new Map<string, number>();
  return (a: { id: string }, b: { id: string }): number => {
    const key = `${a.id}|${b.id}`;
    let k = cache.get(key);
    if (k === undefined) {
      const pa = profiles.get(a.id);
      const pb = profiles.get(b.id);
      k = pa && pb ? kernPair(pa, pb, metrics) : 0;
      cache.set(key, k);
    }
    return k;
  };
}
