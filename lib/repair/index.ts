import { bankFromGlyphs, type GlyphBank } from "@/lib/bank/bank";
import { penGlyph } from "@/lib/font/pen";
import type { RenderGlyph } from "@/lib/render/layout";
import type { GlyphMask, ScannedGlyph } from "@/lib/scan/scanPage";
import { bridgeRuleGaps } from "./bridge";
import { tightInk } from "./ink";
import { normalizeMetrics, type FontMetrics } from "./metrics";
import { kerning, sideBearings } from "./spacing";
import { pickTypical } from "./typical";

export type { FontMetrics } from "./metrics";

export type RepairedFont = {
  /** Up to three samples per character, the most typical first. */
  glyphs: ScannedGlyph[];
  bank: GlyphBank;
  masks: Map<string, GlyphMask>;
  metrics: FontMetrics;
  /** Layout settings that match the repaired letters. */
  layout: { xHeight: number; wordSpacing: number; kern: (left: RenderGlyph, right: RenderGlyph) => number };
};

/** Pen stroke width as a share of the x-height. */
const NIB = 0.14;

/**
 * Lines the samples up into one consistent hand: strokes cut by the notebook
 * rules joined again, trimmed to their ink, one
 * baseline and size, the odd ones out dropped, and spaced by their shapes.
 * With `pen`, every letter is also redrawn with the same smooth stroke.
 */
export function repairFont(glyphs: readonly ScannedGlyph[], options: { pen?: boolean } = {}): RepairedFont {
  const tight = glyphs.map((g) => tightInk(bridgeRuleGaps(g))).filter((g) => g !== null);
  const { glyphs: normal, metrics } = normalizeMetrics(tight);
  const typical = pickTypical(normal);
  const drawn = options.pen ? typical.map((g) => tightInk(penGlyph(g, metrics.xHeight * NIB)) ?? g) : typical;
  const spaced = drawn.map((g) => sideBearings(g, metrics));
  return {
    glyphs: spaced,
    bank: bankFromGlyphs(spaced),
    masks: new Map(spaced.map((g) => [g.id, g.mask])),
    metrics,
    layout: { xHeight: metrics.xHeight, wordSpacing: metrics.xHeight * 0.55, kern: kerning(spaced, metrics) },
  };
}
