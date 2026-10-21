import type { ScannedGlyph } from "@/lib/scan/scanPage";
import { INK, unitOf } from "./ink";

/**
 * Removing the notebook rules can cut a stroke where it crossed a line, like
 * the stem of a `p` at the baseline. Where solid ink sits just above and just
 * below a rule row in the same column, the short gap between is filled back in.
 * Runs on the stored sample, whose `topU` still says where the rules were.
 */
export function bridgeRuleGaps(glyph: ScannedGlyph): ScannedGlyph {
  const { width, height, data } = glyph.mask;
  const unit = unitOf(glyph);
  if (!(unit > 0)) return glyph;
  const maxGap = Math.max(3, Math.round(unit * 0.1));
  const rows = [-1, 0, 1].map((k) => Math.round((k - glyph.metrics.topU) * unit)).filter((r) => r >= 0 && r < height);
  if (rows.length === 0) return glyph;
  const out = data.slice();
  let changed = false;
  const near = Math.ceil(maxGap / 2);
  for (const r of rows) {
    for (let x = 0; x < width; x++) {
      let last = -1;
      for (let y = Math.max(0, r - maxGap); y <= Math.min(height - 1, r + maxGap); y++) {
        if (data[y * width + x] < INK) continue;
        const gap = y - last - 1;
        if (last >= 0 && gap > 0 && gap <= maxGap && last + 1 <= r + near && y - 1 >= r - near) {
          const alpha = Math.min(data[last * width + x], data[y * width + x]);
          for (let yy = last + 1; yy < y; yy++) {
            const i = yy * width + x;
            if (out[i] < alpha) {
              out[i] = alpha;
              changed = true;
            }
          }
        }
        last = y;
      }
    }
  }
  return changed ? { ...glyph, mask: { ...glyph.mask, data: out } } : glyph;
}
