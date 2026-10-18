import { describe, expect, it } from "vitest";
import type { LineInk } from "@/lib/scan/scanPage";
import { parseReading, readingsMatch } from "./reading";
import { segmentLine } from "./segment";

function cropWith(draw: (ink: Uint8Array, w: number) => void, width: number, height: number): LineInk {
  const ink = new Uint8Array(width * height);
  draw(ink, width);
  return { width, height, ink, contrast: ink.map((v) => (v ? 80 : 0)), baselineY: height - 4, unit: 30, inkRef: 80 };
}

function blob(ink: Uint8Array, w: number, x0: number, x1: number, y0: number, y1: number) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) ink[y * w + x] = 1;
}

describe("parseReading", () => {
  it("reads a JSON object, a fenced reply, and a bare array", () => {
    expect(parseReading('{"chars":["J","J","K"]}')).toEqual(["J", "J", "K"]);
    expect(parseReading('Sure\n```json\n{"characters":["a","b"]}\n```')).toEqual(["a", "b"]);
    expect(parseReading('[".",","]')).toEqual([".", ","]);
  });

  it("rejects prose and multi-character entries", () => {
    expect(() => parseReading("the line says AAA")).toThrow(/character list/);
    expect(() => parseReading('{"chars":["AA","B"]}')).toThrow(/one entry/);
  });
});

describe("readingsMatch", () => {
  it("requires the same characters in the same order", () => {
    expect(readingsMatch(["A", "A", "B"], ["A", "A", "B"])).toBe(true);
    expect(readingsMatch(["A", "a"], ["A", "A"])).toBe(false);
    expect(readingsMatch(["A"], ["A", "A"])).toBe(false);
  });
});

describe("segmentLine", () => {
  it("splits two touching letters at the narrow join and keeps a separated one", () => {
    const crop = cropWith((ink, w) => {
      blob(ink, w, 4, 16, 8, 28);
      blob(ink, w, 40, 58, 8, 28);
      blob(ink, w, 62, 80, 8, 28);
      blob(ink, w, 59, 61, 18, 19);
    }, 100, 36);
    const glyphs = segmentLine(
      crop,
      [
        { char: "A", variant: 0 },
        { char: "B", variant: 0 },
        { char: "B", variant: 1 },
      ],
      4,
      "p:4",
    );
    expect(glyphs).not.toBeNull();
    expect(glyphs!.map((g) => g.char)).toEqual(["A", "B", "B"]);
    expect(glyphs![0].mask.width).toBeLessThan(glyphs![1].mask.width + glyphs![2].mask.width);
    for (const g of glyphs!) {
      const inkPixels = [...g.mask.data].filter((v) => v > 0).length;
      expect(inkPixels).toBeGreaterThan(20);
    }
  });

  it("returns null when the ink is one solid block with no join to cut", () => {
    const crop = cropWith((ink, w) => blob(ink, w, 5, 70, 8, 28), 90, 36);
    expect(
      segmentLine(crop, [{ char: "A", variant: 0 }, { char: "A", variant: 1 }], 1, "p"),
    ).toBeNull();
  });
});
