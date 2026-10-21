import { describe, expect, it } from "vitest";
import { layoutText, DEFAULT_LAYOUT } from "@/lib/render/layout";
import type { ScannedGlyph } from "@/lib/scan/scanPage";
import { repairFont } from ".";
import type { FontMetrics } from "./metrics";
import { kernPair, profileOf } from "./spacing";

const UNIT = 40;
const metrics: FontMetrics = { xHeight: 0.5, capHeight: 0.8, descender: 0.3 };

function shape(id: string, char: string, rows: string[], bottomU = 0): ScannedGlyph {
  const width = rows[0].length;
  const height = rows.length;
  const data = new Uint8Array(width * height);
  rows.forEach((row, y) => [...row].forEach((c, x) => c === "#" && (data[y * width + x] = 255)));
  return {
    id,
    char,
    variant: 0,
    lineNumber: 0,
    mask: { width, height, data },
    metrics: { widthU: width / UNIT, heightU: height / UNIT, topU: bottomU - height / UNIT },
  };
}

const bar = (id: string, padding: number) =>
  shape(id, "l", Array.from({ length: 32 }, () => " ".repeat(padding) + "####" + " ".repeat(padding)));

/** Pixel gap between the ink of the first two placed glyphs. */
function visibleGap(text: string, glyphs: ScannedGlyph[]): number {
  const font = repairFont(glyphs);
  const layout = layoutText(text, font.bank, { ...DEFAULT_LAYOUT, ...font.layout, width: 2000, wobble: 0 });
  const [a, b] = layout.placed;
  return b.x - (a.x + a.w);
}

describe("side bearings", () => {
  it("leaves the same gap between bars cut with tight and loose boxes", () => {
    const tight = visibleGap("ll", [bar("l1", 1), bar("l2", 1)]);
    const loose = visibleGap("ll", [bar("l1", 12), bar("l2", 12)]);
    expect(tight).toBeGreaterThan(0);
    expect(loose).toBeCloseTo(tight, 5);
  });
});

describe("kernPair", () => {
  const bowl = shape("a", "a", [
    "  ####  ",
    " ###### ",
    "####### ",
    "######  ",
    "#####   ",
    "######  ",
    "####### ",
    " ###### ",
    "  ####  ",
    "   ###  ",
  ]);
  const box = shape("m", "m", Array.from({ length: 10 }, () => "########"));
  const r = shape("r", "r", [
    "########",
    "########",
    "###     ",
    "###     ",
    "###     ",
    "###     ",
    "###     ",
    "###     ",
    "###     ",
    "###     ",
  ]);

  it("pulls an open letter towards its neighbour", () => {
    expect(kernPair(profileOf(bowl, metrics), profileOf(box, metrics), metrics)).toBeLessThan(0);
  });

  it("does not kern two flat sides", () => {
    expect(kernPair(profileOf(box, metrics), profileOf(box, metrics), metrics)).toBe(0);
  });

  it("does not let r touch the next letter", () => {
    const k = kernPair(profileOf(r, metrics), profileOf(box, metrics), metrics);
    const side = metrics.xHeight * 0.06;
    expect(k).toBeLessThanOrEqual(0);
    expect(2 * side + k).toBeGreaterThan(0);
  });
});
