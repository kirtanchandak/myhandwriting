import type { ScannedGlyph } from "@/lib/scan/scanPage";
import { median } from "./ink";

/** Heights of the handwriting, in rule units. */
export type FontMetrics = { xHeight: number; capHeight: number; descender: number };

const X_HEIGHT = new Set("acemnorsuvwxz");
const CAP_HEIGHT = new Set("ABCDEFGHIKLMNOPRSTUVWXYZbdhklt0123456789");
const DESCENDER = new Set("gpqy");

/** Where a sample goes vertically, given its height after scaling. Returns its new top. */
type Place = (height: number, m: FontMetrics) => number;

const onLine: Place = (h) => -h;
const hanging: Place = (h, m) => m.descender - h;
const atCap: Place = (_h, m) => -m.capHeight;
const midX: Place = (h, m) => -m.xHeight / 2 - h / 2;
const bracket: Place = (h, m) => (-m.capHeight + m.descender * 0.6) / 2 - h / 2;

const PLACES: Record<string, Place> = {
  j: hanging,
  ",": (h) => -h * 0.6,
  ";": (h) => -h * 0.8,
  "'": atCap,
  '"': atCap,
  "`": atCap,
  "*": atCap,
  "^": atCap,
  "-": midX,
  "+": midX,
  "=": midX,
  "~": midX,
  _: (_h, m) => m.xHeight * 0.05,
  "(": bracket,
  ")": bracket,
  "[": bracket,
  "]": bracket,
  "{": bracket,
  "}": bracket,
  "/": bracket,
  "\\": bracket,
  "|": bracket,
};

function heightsOf(glyphs: readonly ScannedGlyph[], set: Set<string>): number[] {
  return glyphs.filter((g) => set.has(g.char)).map((g) => g.metrics.heightU);
}

/** Measures x-height, cap height and descender depth from the letters themselves. */
export function measureFont(glyphs: readonly ScannedGlyph[]): FontMetrics {
  const x = median(heightsOf(glyphs, X_HEIGHT));
  const cap = median(heightsOf(glyphs, CAP_HEIGHT));
  const desc = median(heightsOf(glyphs, DESCENDER));
  const xHeight = x ?? (cap ? cap * 0.62 : (median(glyphs.map((g) => g.metrics.heightU)) ?? 0.66) * 0.6);
  const capHeight = Math.max(cap ?? xHeight * 1.6, xHeight * 1.1);
  const descender = Math.max(desc !== undefined ? desc - xHeight : xHeight * 0.6, xHeight * 0.2);
  return { xHeight, capHeight, descender };
}

function classHeight(char: string, m: FontMetrics): number | undefined {
  if (X_HEIGHT.has(char)) return m.xHeight;
  if (CAP_HEIGHT.has(char)) return m.capHeight;
  if (DESCENDER.has(char)) return m.xHeight + m.descender;
  return undefined;
}

/**
 * Scales every sample to the height of its class and stands it on one shared
 * baseline. Characters without a class keep the median height of their own samples.
 */
export function normalizeMetrics(glyphs: readonly ScannedGlyph[]): { glyphs: ScannedGlyph[]; metrics: FontMetrics } {
  const metrics = measureFont(glyphs);
  const ownHeight = new Map<string, number>();
  const byChar = new Map<string, number[]>();
  for (const g of glyphs) byChar.set(g.char, [...(byChar.get(g.char) ?? []), g.metrics.heightU]);
  for (const [char, heights] of byChar) ownHeight.set(char, median(heights)!);

  const out = glyphs.map((g) => {
    const target = classHeight(g.char, metrics) ?? ownHeight.get(g.char)!;
    const scale = Math.min(2, Math.max(0.5, target / g.metrics.heightU));
    const heightU = g.metrics.heightU * scale;
    const place = PLACES[g.char] ?? (DESCENDER.has(g.char) ? hanging : onLine);
    return {
      ...g,
      metrics: { ...g.metrics, widthU: g.metrics.widthU * scale, heightU, topU: place(heightU, metrics) },
    };
  });
  return { glyphs: out, metrics };
}
