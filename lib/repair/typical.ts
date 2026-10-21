import type { ScannedGlyph } from "@/lib/scan/scanPage";
import { INK, median } from "./ink";

const KEEP = 3;
/** A sample whose shape is this many times wider or narrower than usual is dropped. */
const MAX_ASPECT_RATIO = 1.35;

function inkDensity(glyph: ScannedGlyph): number {
  let on = 0;
  for (const v of glyph.mask.data) if (v >= INK) on++;
  return on / Math.max(1, glyph.mask.data.length);
}

/**
 * Per character, keeps the samples closest to the usual shape, best first.
 * Wild ones, such as a letter twice as wide as its others, are dropped, but
 * every character keeps at least one sample.
 */
export function pickTypical(glyphs: readonly ScannedGlyph[]): ScannedGlyph[] {
  const byChar = new Map<string, ScannedGlyph[]>();
  for (const g of glyphs) byChar.set(g.char, [...(byChar.get(g.char) ?? []), g]);
  const out: ScannedGlyph[] = [];
  for (const list of byChar.values()) {
    const aspect = list.map((g) => Math.log(g.metrics.widthU / g.metrics.heightU));
    const density = list.map(inkDensity);
    const midAspect = median(aspect)!;
    const midDensity = median(density)!;
    const scored = list
      .map((glyph, i) => {
        const off = Math.abs(aspect[i] - midAspect);
        return { glyph, off, score: off + Math.abs(density[i] - midDensity) / Math.max(midDensity, 0.01) };
      })
      .sort((a, b) => a.score - b.score);
    const kept = scored.filter((s, i) => i === 0 || s.off <= Math.log(MAX_ASPECT_RATIO));
    out.push(...kept.slice(0, KEEP).map((s) => s.glyph));
  }
  return out;
}
