import { describe, expect, it } from "vitest";
import type { ScannedGlyph } from "@/lib/scan/scanPage";
import { traceContours } from "./trace";
import { penGlyph, penStrokes } from "./pen";

function block(width: number, height: number, on: (x: number, y: number) => boolean): ScannedGlyph {
  const data = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (on(x, y)) data[y * width + x] = 255;
  return {
    id: "p",
    char: "A",
    variant: 0,
    lineNumber: 0,
    mask: { width, height, data },
    metrics: { widthU: width / 40, heightU: height / 40, topU: -height / 40 },
  };
}

/** Widest run of ink in each row of the mask. */
function rowWidths(glyph: ScannedGlyph): number[] {
  const { width, height, data } = glyph.mask;
  const out: number[] = [];
  for (let y = 0; y < height; y++) {
    let run = 0;
    let best = 0;
    for (let x = 0; x < width; x++) {
      run = data[y * width + x] >= 128 ? run + 1 : 0;
      best = Math.max(best, run);
    }
    if (best) out.push(best);
  }
  return out;
}

describe("penGlyph", () => {
  it("redraws a thick stroke as a thinner filled stroke", () => {
    const bar = penGlyph(block(20, 8, () => true));
    const ink = [...bar.mask.data].filter((v) => v > 0).length;
    expect(ink).toBeGreaterThan(10);
    expect(ink / bar.mask.data.length).toBeLessThan(0.55);
  });

  it("keeps the hole of a ring", () => {
    const ring = penGlyph(block(15, 15, (x, y) => x < 4 || y < 4 || x > 10 || y > 10));
    expect(traceContours(ring.mask.data, ring.mask.width, ring.mask.height)).toHaveLength(2);
  });

  it("cuts off a bump on a stroke but keeps a real arm", () => {
    const stem = (x: number) => x >= 8 && x < 12;
    const bump = (x: number, y: number) => y >= 20 && y < 22 && x >= 12 && x < 14;
    expect(penStrokes(block(20, 40, (x, y) => stem(x) || bump(x, y)).mask)).toHaveLength(1);
    const arm = (x: number, y: number) => y >= 20 && y < 22 && x >= 12 && x < 19;
    expect(penStrokes(block(20, 40, (x, y) => stem(x) || arm(x, y)).mask)).toHaveLength(3);
  });

  it("draws a slanted stroke at an even width", () => {
    const slant = penGlyph(block(30, 40, (x, y) => Math.abs(x - (5 + y * 0.5)) < 2.5), 0.15);
    const widths = rowWidths(slant).slice(8, -8);
    expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(3);
  });
});
