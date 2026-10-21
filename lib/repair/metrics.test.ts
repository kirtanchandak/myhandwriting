import { describe, expect, it } from "vitest";
import type { ScannedGlyph } from "@/lib/scan/scanPage";
import { bridgeRuleGaps } from "./bridge";
import { tightInk } from "./ink";
import { normalizeMetrics } from "./metrics";
import { pickTypical } from "./typical";

const UNIT = 40;

/** A solid block of ink `w` by `h` pixels, inside `pad` pixels of blank, with its bottom `bottomU` below the line. */
function sample(char: string, w: number, h: number, bottomU: number, pad = 0, id = char): ScannedGlyph {
  const width = w + pad * 2;
  const height = h + pad * 2;
  const data = new Uint8Array(width * height);
  for (let y = pad; y < pad + h; y++) data.fill(255, y * width + pad, y * width + pad + w);
  return {
    id,
    char,
    variant: 0,
    lineNumber: 0,
    mask: { width, height, data },
    metrics: { widthU: width / UNIT, heightU: height / UNIT, topU: bottomU + pad / UNIT - height / UNIT },
  };
}

describe("tightInk", () => {
  it("trims blank padding and keeps the ink where it was", () => {
    const g = tightInk(sample("o", 10, 12, 0, 6))!;
    expect(g.mask.width).toBe(12);
    expect(g.mask.height).toBe(14);
    expect(g.metrics.topU + g.metrics.heightU).toBeCloseTo(1 / UNIT, 5);
  });

  it("returns null when nothing is solid", () => {
    const g = sample("o", 4, 4, 0);
    g.mask.data.fill(60);
    expect(tightInk(g)).toBeNull();
  });
});

describe("normalizeMetrics", () => {
  it("gives letters written at different sizes and heights one x-height and baseline", () => {
    const glyphs = [
      sample("a", 12, 14, 0.1, 0, "a1"),
      sample("a", 20, 24, -0.2, 0, "a2"),
      sample("n", 14, 16, 0.05),
      sample("o", 13, 15, -0.3),
      sample("h", 12, 26, 0.1),
      sample("g", 12, 24, 0.4),
    ];
    const { glyphs: out, metrics } = normalizeMetrics(glyphs);
    const byId = new Map(out.map((g) => [g.id, g]));
    for (const id of ["a1", "a2", "n", "o"]) {
      const g = byId.get(id)!;
      expect(g.metrics.heightU).toBeCloseTo(metrics.xHeight, 5);
      expect(g.metrics.topU + g.metrics.heightU).toBeCloseTo(0, 5);
    }
    expect(byId.get("h")!.metrics.heightU).toBeCloseTo(metrics.capHeight, 5);
    const g = byId.get("g")!;
    expect(g.metrics.topU).toBeCloseTo(-metrics.xHeight, 5);
    expect(g.metrics.topU + g.metrics.heightU).toBeGreaterThan(0.1);
  });

  it("keeps the aspect ratio of each sample", () => {
    const { glyphs } = normalizeMetrics([sample("a", 12, 14, 0), sample("o", 30, 20, 0)]);
    const o = glyphs.find((g) => g.char === "o")!;
    expect(o.metrics.widthU / o.metrics.heightU).toBeCloseTo(1.5, 5);
  });

  it("puts a period on the line and a quote at the cap height", () => {
    const { glyphs, metrics } = normalizeMetrics([
      sample("a", 12, 14, 0),
      sample("H", 14, 26, 0),
      sample(".", 4, 4, -0.4),
      sample("'", 3, 7, 0),
    ]);
    const period = glyphs.find((g) => g.char === ".")!;
    const quote = glyphs.find((g) => g.char === "'")!;
    expect(period.metrics.topU + period.metrics.heightU).toBeCloseTo(0, 5);
    expect(quote.metrics.topU).toBeCloseTo(-metrics.capHeight, 5);
  });
});

describe("pickTypical", () => {
  it("drops a sample far wider than its others and keeps the closest first", () => {
    const out = pickTypical([
      sample("K", 14, 26, 0, 0, "k1"),
      sample("K", 40, 26, 0, 0, "wide"),
      sample("K", 15, 26, 0, 0, "k2"),
      sample("K", 13, 26, 0, 0, "k3"),
    ]);
    expect(out.map((g) => g.id)).not.toContain("wide");
    expect(out[0].id).toBe("k1");
    expect(out).toHaveLength(3);
  });

  it("keeps a lone sample however odd it is", () => {
    expect(pickTypical([sample("K", 60, 10, 0)])).toHaveLength(1);
  });
});

describe("bridgeRuleGaps", () => {
  it("joins a stem cut where it crossed the baseline", () => {
    const g = sample("p", 4, 30, 0.4);
    const baselineRow = Math.round(-g.metrics.topU * UNIT);
    for (let y = baselineRow - 1; y <= baselineRow + 1; y++) g.mask.data.fill(0, y * 4, y * 4 + 4);
    const fixed = bridgeRuleGaps(g);
    expect([...fixed.mask.data].every((v) => v === 255)).toBe(true);
  });

  it("leaves a gap away from the rules alone", () => {
    const g = sample("i", 4, 30, 0);
    g.mask.data.fill(0, 8 * 4, 10 * 4);
    expect(bridgeRuleGaps(g)).toBe(g);
  });
});
