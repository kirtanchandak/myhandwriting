import type { ScannedGlyph, ScannedLine } from "@/lib/scan/scanPage";

export type GlyphBank = Map<string, ScannedGlyph[]>;

/**
 * Builds the bank from scanned lines in upload order. A later successful scan
 * of a line replaces an earlier one, so a redo photo fixes just that line.
 */
export function buildBank(scans: ScannedLine[][], excluded: ReadonlySet<string> = new Set()): GlyphBank {
  const byLine = new Map<number, ScannedLine>();
  for (const page of scans) for (const line of page) if (line.ok) byLine.set(line.lineNumber, line);
  const bank: GlyphBank = new Map();
  for (const line of [...byLine.values()].sort((a, b) => a.lineNumber - b.lineNumber)) {
    for (const g of line.glyphs) {
      if (excluded.has(g.id)) continue;
      const list = bank.get(g.char) ?? [];
      list.push(g);
      bank.set(g.char, list);
    }
  }
  return bank;
}

/** Keeps every glyph. A second photo of the same letters adds samples. */
export function bankFromGlyphs(glyphs: readonly ScannedGlyph[], excluded: ReadonlySet<string> = new Set()): GlyphBank {
  const bank: GlyphBank = new Map();
  for (const g of glyphs) {
    if (excluded.has(g.id)) continue;
    const list = bank.get(g.char) ?? [];
    list.push(g);
    bank.set(g.char, list);
  }
  return bank;
}

/** Keeps samples of characters that have none yet. Characters already collected are dropped. */
export function glyphsForEmptyCards(taken: ReadonlySet<string>, glyphs: readonly ScannedGlyph[]): ScannedGlyph[] {
  return glyphs.filter((g) => !taken.has(g.char));
}

export function missingChars(bank: GlyphBank, charset: readonly string[]): string[] {
  return charset.filter((c) => !bank.get(c)?.length);
}
