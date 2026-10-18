import type { LineInk, ScannedGlyph } from "@/lib/scan/scanPage";
import { glyphFromRange, type Range } from "./segment";

export type PlacedChar = { char: string; /** Horizontal center, 0 to 1. */ x: number };

/** Pulls characters and their horizontal centers out of a notes reply. */
export function parseNoteReading(text: string): PlacedChar[] {
  const cleaned = text.replace(/```(?:json)?/gi, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  let chars: unknown;
  try {
    if (start < 0 || end < start) throw new Error("no object");
    const parsed = JSON.parse(cleaned.slice(start, end + 1)) as { chars?: unknown };
    chars = parsed.chars;
  } catch {
    throw new Error("The model did not return character positions.");
  }
  if (!Array.isArray(chars) || chars.length === 0) throw new Error("The model did not return character positions.");
  const raw = chars.map((item) => {
    if (!item || typeof item !== "object") return null;
    const record = item as { c?: unknown; char?: unknown; x?: unknown };
    const char = typeof record.c === "string" ? record.c : record.char;
    const x = typeof record.x === "number" ? record.x : Number(record.x);
    if (typeof char !== "string" || [...char].length !== 1 || !Number.isFinite(x)) return null;
    return { char, x };
  });
  if (raw.some((item) => item === null)) throw new Error("The model did not mark where each character sits.");
  return normalizeX(raw as PlacedChar[]);
}

/**
 * Cuts a line of ordinary writing at the centers the model marked.
 * Letters that touch are split halfway between those centers.
 */
export function segmentNotes(crop: LineInk, placed: readonly PlacedChar[], idPrefix: string): ScannedGlyph[] {
  const sorted = placed.filter((p) => p.x >= 0 && p.x <= 1).sort((a, b) => a.x - b.x);
  const seen = new Map<string, number>();
  const glyphs: ScannedGlyph[] = [];
  sorted.forEach((p, i) => {
    const left = i === 0 ? 0 : (sorted[i - 1].x + p.x) / 2;
    const right = i === sorted.length - 1 ? 1 : (p.x + sorted[i + 1].x) / 2;
    const range = tight(crop, Math.floor(left * crop.width), Math.min(crop.width - 1, Math.ceil(right * crop.width) - 1));
    if (!range) return;
    const variant = seen.get(p.char) ?? 0;
    seen.set(p.char, variant + 1);
    glyphs.push(glyphFromRange(crop, range, { char: p.char, variant }, 0, `${idPrefix}:n${glyphs.length}`));
  });
  return glyphs;
}

function normalizeX(placed: PlacedChar[]): PlacedChar[] {
  const max = placed.reduce((m, p) => Math.max(m, p.x), 0);
  const scale = max <= 1.5 ? 1 : max <= 100 ? 100 : 1000;
  return placed.map((p) => ({ char: p.char, x: Math.min(1, Math.max(0, p.x / scale)) }));
}

function tight(crop: LineInk, x0: number, x1: number): Range | null {
  if (x1 < x0) return null;
  let nx0 = x1;
  let nx1 = x0;
  let ny0 = crop.height;
  let ny1 = 0;
  let any = false;
  for (let y = 0; y < crop.height; y++) {
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
