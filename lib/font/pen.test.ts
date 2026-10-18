import { describe, expect, it } from "vitest";
import type { ScannedGlyph } from "@/lib/scan/scanPage";
import { traceContours } from "./trace";
import { penGlyph } from "./pen";

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

describe("penGlyph", () => {
  it("redraws a thick stroke as a thinner filled stroke and keeps a hole", () => {
    const bar = penGlyph(block(20, 8, () => true));
    const ink = [...bar.mask.data].filter((v) => v > 0).length;
    expect(ink).toBeGreaterThan(10);
    expect(ink / bar.mask.data.length).toBeLessThan(0.55);

    const ring = penGlyph(block(15, 15, (x, y) => x < 4 || y < 4 || x > 10 || y > 10));
    expect(traceContours(ring.mask.data, ring.mask.width, ring.mask.height)).toHaveLength(2);
  });
});
