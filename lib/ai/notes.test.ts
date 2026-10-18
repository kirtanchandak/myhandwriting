import { describe, expect, it } from "vitest";
import type { LineInk, ScannedGlyph } from "@/lib/scan/scanPage";
import { glyphsToTopUp } from "@/lib/bank/bank";
import { parseNoteReading, segmentNotes } from "./notes";

function cropWith(blobs: Array<[number, number]>): LineInk {
  const width = 90;
  const height = 20;
  const ink = new Uint8Array(width * height);
  for (const [x0, x1] of blobs) {
    for (let y = 4; y <= 16; y++) for (let x = x0; x <= x1; x++) ink[y * width + x] = 1;
  }
  return { width, height, ink, contrast: ink.map((v) => (v ? 80 : 0)), baselineY: 16, unit: 20, inkRef: 80 };
}

describe("parseNoteReading", () => {
  it("reads centers and rescales a 0 to 1000 reply", () => {
    expect(parseNoteReading('{"chars":[{"c":"H","x":0.1},{"char":"i","x":0.2}]}')).toEqual([
      { char: "H", x: 0.1 },
      { char: "i", x: 0.2 },
    ]);
    const scaled = parseNoteReading('{"chars":[{"c":"A","x":120},{"c":"B","x":800}]}');
    expect(scaled.map((p) => p.x)).toEqual([0.12, 0.8]);
  });

  it("rejects a plain character list", () => {
    expect(() => parseNoteReading('{"chars":["A","B"]}')).toThrow(/where each character/);
  });
});

describe("segmentNotes", () => {
  it("splits two touching strokes at the midpoint of their centers", () => {
    const glyphs = segmentNotes(
      cropWith([
        [4, 20],
        [21, 40],
      ]),
      [
        { char: "H", x: 12 / 90 },
        { char: "i", x: 30 / 90 },
      ],
      "p",
    );
    expect(glyphs.map((g) => g.char)).toEqual(["H", "i"]);
    expect(glyphs[0].mask.width).toBeLessThan(30);
    expect(glyphs[1].mask.width).toBeLessThan(30);
  });
});

describe("glyphsToTopUp", () => {
  const glyph = (char: string): ScannedGlyph => ({
    id: char,
    char,
    variant: 0,
    lineNumber: 0,
    mask: { width: 1, height: 1, data: Uint8Array.of(1) },
    metrics: { widthU: 1, heightU: 1, topU: 0 },
  });

  it("tops each character up to three samples", () => {
    const existing = new Map([
      ["A", 1],
      ["B", 3],
    ]);
    const found = [glyph("A"), glyph("A"), glyph("A"), glyph("B"), glyph("C"), glyph("C"), glyph("C"), glyph("C")];
    expect(glyphsToTopUp(existing, found).map((g) => g.char)).toEqual(["A", "A", "C", "C", "C"]);
  });
});
