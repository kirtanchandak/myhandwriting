import { describe, expect, it } from "vitest";
import type { ScannedGlyph } from "./scanPage";
import { plausibleGlyph, tidyGlyph } from "./tidy";

function glyph(char: string, rows: string[]): ScannedGlyph {
  const width = rows[0].length;
  const height = rows.length;
  const data = new Uint8Array(width * height);
  rows.forEach((row, y) => [...row].forEach((c, x) => (data[y * width + x] = c === "#" ? 255 : 0)));
  return {
    id: "p:n0",
    char,
    variant: 0,
    lineNumber: 0,
    mask: { width, height, data },
    metrics: { widthU: width / 10, heightU: height / 10, topU: -height / 10 },
  };
}

describe("tidyGlyph", () => {
  it("drops a neighbour's stroke at the edge and trims the box", () => {
    const n = glyph("n", [
      "                ",
      "#   ######      ",
      "#   #     #     ",
      "#   #      #    ",
      "    #      #    ",
      "    #      #    ",
      "    #      #    ",
    ]);
    const out = tidyGlyph(n);
    expect(out.mask.width).toBe(10);
    expect(out.metrics.widthU).toBeCloseTo(1);
    expect(out.mask.data[0]).toBe(0);
  });

  it("keeps the dot of an i", () => {
    const i = glyph("i", [" ## ", " ## ", "    ", " ## ", " ## ", " ## ", " ## "]);
    const out = tidyGlyph(i);
    expect(out.mask.height).toBe(7);
    expect(out.mask.data[1]).toBe(255);
  });
});

describe("plausibleGlyph", () => {
  it("rejects a flat sliver labelled as a letter but keeps a dash", () => {
    const flat = glyph("L", ["########"]);
    expect(plausibleGlyph(flat)).toBe(false);
    expect(plausibleGlyph({ ...flat, char: "-" })).toBe(true);
  });
});
