import { describe, expect, it } from "vitest";
import { DEFAULT_LAYOUT, layoutText, mulberry32, pickVariant, type RenderGlyph } from "./layout";

const glyph = (char: string, i: number): RenderGlyph => ({
  id: `${char}${i}`,
  char,
  metrics: { widthU: 0.4, heightU: 0.6, topU: -0.6 },
});
const bank = new Map([..."abcdehlorTw"].map((c) => [c, [0, 1, 2].map((i) => glyph(c, i))]));
const opts = { ...DEFAULT_LAYOUT, width: 600 };

describe("pickVariant", () => {
  it("never repeats the previous pick and avoids the last two with 3+ samples", () => {
    const rand = mulberry32(1);
    const history: number[] = [];
    for (let i = 0; i < 200; i++) {
      const v = pickVariant(3, history.slice(-2), rand);
      if (history.length) expect(v).not.toBe(history.at(-1));
      if (history.length > 1) expect(v).not.toBe(history.at(-2));
      history.push(v);
    }
  });

  it("alternates with two samples and returns 0 with one", () => {
    const rand = mulberry32(2);
    expect(pickVariant(1, [0], rand)).toBe(0);
    expect(pickVariant(2, [0], rand)).toBe(1);
    expect(pickVariant(2, [1], rand)).toBe(0);
  });
});

describe("layoutText", () => {
  it("places every known character and is reproducible for a seed", () => {
    const a = layoutText("hello world", bank, opts);
    const b = layoutText("hello world", bank, opts);
    expect(a.placed).toHaveLength(10);
    expect(a).toEqual(b);
    expect(layoutText("hello world", bank, { ...opts, seed: 99 }).placed).not.toEqual(a.placed);
  });

  it("does not stamp the same sample twice in a row for repeated letters", () => {
    const ids = layoutText("llllllll", bank, opts).placed.map((p) => p.glyph.id);
    for (let i = 1; i < ids.length; i++) expect(ids[i]).not.toBe(ids[i - 1]);
  });

  it("wraps words onto new lines inside the width", () => {
    const layout = layoutText("hello world hello world hello world hello world", bank, opts);
    expect(layout.baselines.length).toBeGreaterThan(1);
    for (const p of layout.placed) expect(p.x + p.w).toBeLessThanOrEqual(opts.width - opts.padding + 1);
  });

  it("starts a new line for newlines and reports missing characters", () => {
    const layout = layoutText("hello\nwor$ld", bank, opts);
    expect(layout.baselines).toHaveLength(2);
    expect(layout.missing).toEqual(["$"]);
  });

  it("falls back to the other case and normalizes curly quotes", () => {
    const layout = layoutText("t \u2019", new Map([["T", [glyph("T", 0)]], ["'", [glyph("'", 0)]]]), opts);
    expect(layout.placed.map((p) => p.glyph.char)).toEqual(["T", "'"]);
    expect(layout.missing).toEqual([]);
  });

  it("puts the glyph top relative to the baseline", () => {
    const layout = layoutText("a", bank, { ...opts, wobble: 0 });
    const p = layout.placed[0];
    expect(p.y + p.h).toBeCloseTo(layout.baselines[0], 5);
  });
});
