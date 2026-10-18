import { describe, expect, it } from "vitest";
import { parse } from "opentype.js";
import { buildHandFont } from "./build";
import { traceContours } from "./trace";

function filled(width: number, height: number, on: (x: number, y: number) => boolean): Uint8Array {
  const data = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (on(x, y)) data[y * width + x] = 255;
  return data;
}

describe("traceContours", () => {
  it("outlines a solid block as one ring and a loop as two", () => {
    expect(traceContours(filled(4, 3, () => true), 4, 3)).toHaveLength(1);
    const ring = filled(5, 5, (x, y) => x === 0 || y === 0 || x === 4 || y === 4);
    expect(traceContours(ring, 5, 5)).toHaveLength(2);
  });
});

describe("buildHandFont", () => {
  it("builds a font file that contains the letter", () => {
    const buffer = buildHandFont("Ada's font", [
      {
        char: "A",
        width: 4,
        height: 6,
        data: filled(4, 6, () => true),
        widthU: 0.5,
        heightU: 0.7,
        topU: -0.7,
      },
    ]);
    const font = parse(buffer);
    expect(font.hasChar("A")).toBe(true);
    expect(font.hasChar("B")).toBe(false);
    expect(font.getAdvanceWidth("A", 1000)).toBeGreaterThan(0);
  });
});
