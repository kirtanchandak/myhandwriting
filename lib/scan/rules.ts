import { median, percentile } from "./image";

export type RuleResult = {
  /** Ink mask with ruled lines and margin lines removed. */
  ink: Uint8Array;
  /** Centre y of each detected horizontal ruled line, top to bottom. */
  ruleYs: number[];
  /** Median distance between neighbouring ruled lines, or null if fewer than 3 were found. */
  spacing: number | null;
};

const GAP_TOLERANCE = 3;
const CHUNK = 48;

/**
 * Marks pixels belonging to long straight runs. A position counts as "on" if
 * the mask is set on the line or either neighbour line, so a 1px drift from
 * residual skew does not break a run.
 */
function markRuns(
  mask: Uint8Array,
  out: Uint8Array,
  count: number,
  length: number,
  index: (line: number, pos: number) => number,
  minRun: number,
) {
  const on = (line: number, pos: number) =>
    mask[index(line, pos)] ||
    (line > 0 && mask[index(line - 1, pos)]) ||
    (line < count - 1 && mask[index(line + 1, pos)]);
  for (let line = 0; line < count; line++) {
    let pos = 0;
    while (pos < length) {
      if (!on(line, pos)) {
        pos++;
        continue;
      }
      const start = pos;
      let last = pos;
      while (pos < length && (on(line, pos) || pos - last <= GAP_TOLERANCE)) {
        if (on(line, pos)) last = pos;
        pos++;
      }
      if (last - start + 1 >= minRun) {
        for (let p = start; p <= last; p++) {
          const i = index(line, p);
          if (mask[i]) out[i] = 1;
        }
      }
      pos = last + 1;
    }
  }
}

/**
 * Removes ruled lines and margin lines from an ink mask. Each ruled line is
 * removed as a thin band that follows the line across the page, so letters on
 * neighbouring lines stop touching through the ruling. Ink clearly darker than
 * the ruling (a pen stroke sitting on the line) is kept.
 */
export function removeRules(mask: Uint8Array, contrast: Uint8Array, w: number, h: number): RuleResult {
  const horizontal = new Uint8Array(w * h);
  const vertical = new Uint8Array(w * h);
  markRuns(mask, horizontal, h, w, (y, x) => y * w + x, Math.round(w * 0.25));
  markRuns(mask, vertical, w, h, (x, y) => y * w + x, Math.round(h * 0.25));

  const rowCount = new Float64Array(h);
  for (let y = 0; y < h; y++) {
    let n = 0;
    for (let x = 0; x < w; x++) n += horizontal[y * w + x];
    rowCount[y] = n;
  }
  const rules: Array<{ y: number; thickness: number }> = [];
  let start = -1;
  let weighted = 0;
  let weight = 0;
  for (let y = 0; y <= h; y++) {
    if (y < h && rowCount[y] > w * 0.15) {
      if (start < 0) start = y;
      weighted += y * rowCount[y];
      weight += rowCount[y];
    } else if (start >= 0) {
      rules.push({ y: weighted / weight, thickness: y - start });
      start = -1;
      weighted = weight = 0;
    }
  }
  const ruleYs = rules.map((r) => r.y);
  const diffs = ruleYs.slice(1).map((y, i) => y - ruleYs[i]).filter((d) => d > 6);
  const spacing = ruleYs.length >= 3 ? median(diffs) : null;
  const half = Math.ceil(median(rules.map((r) => r.thickness)) / 2) + 1;

  const ruledContrast: number[] = [];
  for (let i = 0; i < mask.length; i += 3) if (horizontal[i]) ruledContrast.push(contrast[i]);
  const keepAbove = ruledContrast.length
    ? Math.max(percentile(ruledContrast, 0.9) * 1.3, median(ruledContrast) * 1.8)
    : Infinity;

  const ink = new Uint8Array(w * h);
  for (let i = 0; i < ink.length; i++) ink[i] = mask[i] && !vertical[i] ? 1 : 0;

  const chunks = Math.ceil(w / CHUNK);
  for (const rule of rules) {
    const centres = new Float64Array(chunks);
    for (let c = 0; c < chunks; c++) {
      let sum = 0;
      let n = 0;
      for (let y = Math.max(0, Math.floor(rule.y - half - 2)); y <= Math.min(h - 1, rule.y + half + 2); y++) {
        for (let x = c * CHUNK; x < Math.min(w, (c + 1) * CHUNK); x++) {
          if (horizontal[y * w + x]) {
            sum += y;
            n++;
          }
        }
      }
      centres[c] = n > CHUNK / 4 ? sum / n : Number.NaN;
    }
    fillGaps(centres, rule.y);

    for (let x = 0; x < w; x++) {
      const pos = x / CHUNK - 0.5;
      const c0 = Math.max(0, Math.min(chunks - 1, Math.floor(pos)));
      const c1 = Math.min(chunks - 1, c0 + 1);
      const t = Math.max(0, Math.min(1, pos - c0));
      const centre = centres[c0] * (1 - t) + centres[c1] * t;
      const y0 = Math.max(0, Math.round(centre - half));
      const y1 = Math.min(h - 1, Math.round(centre + half));
      for (let y = y0; y <= y1; y++) {
        const i = y * w + x;
        if (contrast[i] <= keepAbove) ink[i] = 0;
      }
    }
  }

  if (spacing) {
    const maxThick = half * 2 + 2;
    clearFaintLines(ink, contrast, w, h, keepAbove, maxThick, Math.round(spacing * 0.9), true);
    clearFaintLines(ink, contrast, w, h, keepAbove, maxThick, Math.round(spacing * 1.25), false);
  }
  return { ink, ruleYs, spacing };
}

/**
 * Removes leftover pieces of ruling and page edges: thin, faint strokes that
 * run (allowing a gentle slope) longer than any pen stroke in the charset.
 * Where a letter crosses the piece the ink is thick, which breaks the run, so
 * the letter is kept; pen ink darker than the ruling is never removed.
 */
function clearFaintLines(
  ink: Uint8Array,
  contrast: Uint8Array,
  w: number,
  h: number,
  keepAbove: number,
  maxThick: number,
  minRun: number,
  horizontal: boolean,
) {
  const along = horizontal ? w : h;
  const across = horizontal ? h : w;
  const at = (a: number, c: number) => (horizontal ? c * w + a : a * w + c);
  const thin = new Uint8Array(w * h);
  for (let a = 0; a < along; a++) {
    let c = 0;
    while (c < across) {
      if (!ink[at(a, c)]) {
        c++;
        continue;
      }
      const start = c;
      while (c < across && ink[at(a, c)]) c++;
      if (c - start <= maxThick) for (let k = start; k < c; k++) thin[at(a, k)] = 1;
    }
  }
  const seen = new Uint8Array(w * h);
  const path: number[] = [];
  for (let c0 = 0; c0 < across; c0++) {
    for (let a0 = 0; a0 < along; a0++) {
      if (!thin[at(a0, c0)] || seen[at(a0, c0)]) continue;
      path.length = 0;
      let c = c0;
      for (let a = a0; a < along; a++) {
        const next = [c, c - 1, c + 1].find((cc) => cc >= 0 && cc < across && thin[at(a, cc)] && !seen[at(a, cc)]);
        if (next === undefined) break;
        c = next;
        seen[at(a, c)] = 1;
        path.push(a, c);
      }
      if (path.length / 2 < minRun) continue;
      const faint: number[] = [];
      for (let i = 0; i < path.length; i += 2) faint.push(contrast[at(path[i], path[i + 1])]);
      faint.sort((x, y) => x - y);
      if (faint[faint.length >> 1] > keepAbove) continue;
      for (let i = 0; i < path.length; i += 2) {
        const a = path[i];
        for (let cc = path[i + 1]; cc >= 0 && thin[at(a, cc)]; cc--) ink[at(a, cc)] = 0;
        for (let cc = path[i + 1] + 1; cc < across && thin[at(a, cc)]; cc++) ink[at(a, cc)] = 0;
      }
    }
  }
}

/**
 * Chunks where the line was hidden behind letters take the line's height from
 * the nearest tracked chunks on either side, so a curved page stays followed.
 */
function fillGaps(centres: Float64Array, fallback: number) {
  const known: number[] = [];
  for (let c = 0; c < centres.length; c++) if (!Number.isNaN(centres[c])) known.push(c);
  if (known.length === 0) {
    centres.fill(fallback);
    return;
  }
  let k = 0;
  for (let c = 0; c < centres.length; c++) {
    if (!Number.isNaN(centres[c])) continue;
    while (k < known.length - 1 && known[k + 1] < c) k++;
    const left = known[k] < c ? known[k] : null;
    const right = known.find((i) => i > c) ?? null;
    if (left === null) centres[c] = centres[right!];
    else if (right === null) centres[c] = centres[left];
    else centres[c] = centres[left] + ((centres[right] - centres[left]) * (c - left)) / (right - left);
  }
}
