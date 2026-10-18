import { describe, expect, it } from "vitest";
import type { ScannedGlyph } from "@/lib/scan/scanPage";
import { reviewOrder } from "@/lib/template/guide";
import { EMPTY_LIBRARY, decodeGlyph, encodeGlyph, upsertPage } from "./library";

function glyph(id: string, char: string): ScannedGlyph {
  return {
    id,
    char,
    variant: 0,
    lineNumber: 1,
    mask: { width: 2, height: 2, data: Uint8Array.of(0, 140, 255, 20) },
    metrics: { widthU: 0.4, heightU: 0.5, topU: -0.4 },
  };
}

describe("reviewOrder", () => {
  it("puts each capital beside its small letter, then everything else", () => {
    expect(reviewOrder(["B", "A", "b", "0", "a", "!"])).toEqual(["A", "a", "B", "b", "0", "!"]);
  });
});

describe("library pages", () => {
  it("round-trips a glyph and replaces a page with the same photo", () => {
    const stored = encodeGlyph(glyph("h:r0:0", "A"));
    const back = decodeGlyph(stored);
    expect([...back.mask.data]).toEqual([0, 140, 255, 20]);
    expect(back.metrics.topU).toBe(-0.4);

    const page = { hash: "abc", name: "page.jpg", savedAt: 1, glyphs: [stored] };
    const again = { ...page, savedAt: 2, glyphs: [encodeGlyph(glyph("h:r0:1", "B"))] };
    const lib = upsertPage(upsertPage(EMPTY_LIBRARY, page), again);
    expect(lib.pages).toHaveLength(1);
    expect(lib.pages[0].glyphs.map((g) => g.char)).toEqual(["B"]);
  });
});
