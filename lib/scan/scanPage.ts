import type { GuideLine, WritingGuide } from "@/lib/template/guide";
import { labelComponents, type Component } from "./components";
import {
  deskew,
  estimateSkew,
  localContrast,
  median,
  paperBounds,
  percentile,
  threshold,
  type Gray,
} from "./image";
import { removeRules } from "./rules";

/** Glyph bitmap: alpha 0..255, row-major. */
export type GlyphMask = { width: number; height: number; data: Uint8Array };

export type GlyphMetrics = {
  /** All in units of the notebook's rule spacing. */
  widthU: number;
  heightU: number;
  /** Top of the bitmap relative to the baseline (negative = above). */
  topU: number;
  /** Margin on each side of the ink, set by the repair pass. */
  sideU?: number;
};

export type ScannedGlyph = {
  id: string;
  char: string;
  variant: number;
  lineNumber: number;
  mask: GlyphMask;
  metrics: GlyphMetrics;
};

/** Ink from one row of writing, kept so it can be re-cut without the rest of the photo. */
export type LineInk = {
  width: number;
  height: number;
  ink: Uint8Array;
  contrast: Uint8Array;
  /** Baseline y inside this crop. */
  baselineY: number;
  unit: number;
  inkRef: number;
};

export type ScannedLine = {
  lineNumber: number;
  ok: boolean;
  found: number;
  expected: number;
  message?: string;
  glyphs: ScannedGlyph[];
  /** Present on lines the scanner could not accept. */
  crop?: LineInk;
};

export type PageScan = {
  ok: boolean;
  message?: string;
  skewDeg: number;
  unitPx: number;
  rulesFound: number;
  lines: ScannedLine[];
  /** Rows of writing that did not match any guide line. */
  extraRows: number;
  /** Every row of writing, top to bottom, for reading with AI. */
  rows: LineInk[];
};

const INK_THRESHOLD = 14;

type Band = { y0: number; y1: number; comps: Component[] };
type Cluster = { x0: number; x1: number; y0: number; y1: number; comps: Component[]; area: number };

/**
 * A page follows the writing template when at least half its rows match a
 * guide line. Empty pages count as the template so they don't use the notes limit.
 */
export function looksLikeTemplate(scan: Pick<PageScan, "rows" | "lines">): boolean {
  if (scan.rows.length === 0) return true;
  const matched = scan.lines.filter((line) => line.ok).length;
  return matched > 0 && matched * 2 >= scan.rows.length;
}

export function scanPage(input: Gray, guide: WritingGuide, startLine = 1, pageId = "p"): PageScan {
  const { width: w, height: h } = input;
  const radius = Math.max(7, Math.round(Math.min(w, h) / 60));

  const firstMask = threshold(localContrast(input, radius), INK_THRESHOLD);
  const skew = estimateSkew(firstMask, w, h);
  const gray = Math.abs(skew) > (0.1 * Math.PI) / 180 ? deskew(input, skew) : input;
  const contrast = localContrast(gray, radius);
  const mask = threshold(contrast, INK_THRESHOLD);
  const { ink, ruleYs, spacing } = removeRules(mask, contrast, w, h);
  const { labels, components } = labelComponents(ink, w, h);
  const skewDeg = (skew * 180) / Math.PI;

  const sizable = components.filter((c) => c.area >= 12);
  const unit = spacing ?? Math.max(20, median(sizable.map((c) => c.y1 - c.y0 + 1)) * 1.5);
  const speck = Math.max(6, Math.round(unit * unit * 0.004));
  const paper = paperBounds(gray);
  const edge = Math.max(3, unit * 0.3);
  const comps = components.filter((c) => {
    const cw = c.x1 - c.x0 + 1;
    const ch = c.y1 - c.y0 + 1;
    if (c.area < speck) return false;
    if (ch > unit * 2.2 || cw > w * 0.4) return false;
    if (cw >= unit * 1.2 && ch <= unit * 0.3) return false;
    if (ch >= unit * 1.5 && cw <= unit * 0.15) return false;
    if (c.x0 < paper.x0 + edge || c.y0 < paper.y0 + edge) return false;
    if (c.x1 > paper.x1 - edge || c.y1 > paper.y1 - edge) return false;
    return true;
  });

  const column = dominantColumn(comps, unit);
  const bands =
    ruleYs.length >= 3
      ? bandsByBaseline(column, ruleYs, unit)
      : findBands(column, unit, h).filter((b) => {
          let tallest = 0;
          let widest = 0;
          for (const c of b.comps) {
            tallest = Math.max(tallest, c.y1 - c.y0 + 1);
            widest = Math.max(widest, c.x1 - c.x0 + 1);
          }
          return tallest >= unit * 0.1 || widest >= unit * 0.25;
        });

  const expected = guide.lines.slice(startLine - 1);
  const base = {
    skewDeg,
    unitPx: unit,
    rulesFound: ruleYs.length,
  };
  if (bands.length === 0) {
    return {
      ...base,
      ok: false,
      message: "No writing found. Check the photo is sharp, bright and shows the whole page.",
      lines: [],
      extraRows: 0,
      rows: [],
    };
  }

  const inkRef = Math.max(INK_THRESHOLD * 2, percentile(sampleInk(contrast, ink), 0.9));
  const ctx: ExtractCtx = { labels, ink, contrast, w, unit, ruleYs, inkRef, pageId };
  const bandClusters = bands.map((b) => overlapClusters(b.comps, unit));
  const rows = bands.map((band, i) => captureLine(band, findBaseline(band, bandClusters[i], ctx), ctx));
  if (expected.length === 0) {
    return {
      ...base,
      ok: false,
      message: `There is no line ${startLine} in the guide.`,
      lines: [],
      extraRows: bands.length,
      rows,
    };
  }
  if (process.env.DEBUG_SCAN) {
    bands.forEach((b, i) =>
      console.log(
        `band ${i} y ${b.y0.toFixed(0)}-${b.y1.toFixed(0)} comps ${b.comps.length} clusters ${bandClusters[i].length}`,
      ),
    );
  }
  const pairs = alignBands(
    bandClusters.map((c) => c.length),
    expected.map((l) => l.glyphs.length),
  );

  const lines: ScannedLine[] = [];
  for (const [bi, li] of pairs) {
    lines.push(extractLine(expected[li], bands[bi], bandClusters[bi].slice(), ctx));
  }

  return {
    ...base,
    ok: true,
    lines,
    extraRows: bands.length - pairs.length,
    rows,
  };
}

function sampleInk(contrast: Uint8Array, ink: Uint8Array): number[] {
  const out: number[] = [];
  for (let i = 0; i < ink.length; i += 5) if (ink[i]) out.push(contrast[i]);
  return out;
}

/**
 * Keeps the writing block and drops margin notes. Components are split into
 * columns wherever a horizontal gap is wider than a couple of letters; the
 * column with the most ink wins. An open notebook's other page falls away.
 */
function dominantColumn(comps: Component[], unit: number): Component[] {
  if (comps.length < 2) return comps;
  let minX = comps[0].x0;
  let maxX = comps[0].x1;
  for (const c of comps) {
    if (c.x0 < minX) minX = c.x0;
    if (c.x1 > maxX) maxX = c.x1;
  }
  const bin = Math.max(4, Math.round(unit / 2));
  const offset = Math.floor(minX / bin);
  const bins = new Float64Array(Math.floor(maxX / bin) - offset + 1);
  for (const c of comps) {
    const i0 = Math.floor(c.x0 / bin) - offset;
    const i1 = Math.floor(c.x1 / bin) - offset;
    const share = c.area / (i1 - i0 + 1);
    for (let i = i0; i <= i1; i++) bins[i] += share;
  }
  const peak = bins.reduce((m, v) => Math.max(m, v), 0);
  const empty = peak * 0.08;
  let bestStart = -1;
  let bestLen = 0;
  let run = -1;
  for (let i = 0; i <= bins.length; i++) {
    if (i < bins.length && bins[i] <= empty) {
      if (run < 0) run = i;
    } else if (run >= 0) {
      const atEdge = run === 0 || i === bins.length;
      if (!atEdge && i - run > bestLen) {
        bestStart = run;
        bestLen = i - run;
      }
      run = -1;
    }
  }
  const gapPx = bestLen * bin;
  if (process.env.DEBUG_SCAN) {
    const show = [...bins].map((v) => (v > empty ? "#" : ".")).join("");
    console.log("column bins", show, { gapPx, bestStart, empty: empty.toFixed(0), peak: peak.toFixed(0) });
  }
  if (bestStart < 0 || gapPx < unit * 1.5) return comps;
  const gapX = (offset + bestStart + bestLen / 2) * bin;
  const left = comps.filter((c) => (c.x0 + c.x1) / 2 < gapX);
  const right = comps.filter((c) => (c.x0 + c.x1) / 2 >= gapX);
  if (left.length === 0 || right.length === 0) return comps;
  return areaOf(right) >= areaOf(left) ? right : left;
}

function areaOf(comps: Component[]): number {
  return comps.reduce((n, c) => n + c.area, 0);
}

/**
 * The ruled line a glyph sits on. Tall letters pick the lowest line they still
 * rise clearly above, so a descender is not claimed by the line below it.
 * Short marks (dots, dashes) fall back to the nearest line.
 */
function baselineFor(c: Component, ruleYs: number[], unit: number): number | null {
  let chosen: number | null = null;
  for (const y of ruleYs) {
    const above = y - c.y0;
    const below = c.y1 - y;
    if (above >= unit * 0.22 && below >= -unit * 0.35 && below <= unit * 0.9) chosen = y;
  }
  if (chosen !== null) return chosen;
  let best = -1;
  let bestDist = Infinity;
  for (const y of ruleYs) {
    const d = Math.abs(y - c.y1);
    if (d < bestDist) {
      best = y;
      bestDist = d;
    }
  }
  return bestDist <= unit * 0.6 ? best : null;
}

/** One band per ruled line that has ink, top to bottom. */
function bandsByBaseline(comps: Component[], ruleYs: number[], unit: number): Band[] {
  const baselineOf = new Map<Component, number>();
  for (const c of comps) {
    const y = baselineFor(c, ruleYs, unit);
    if (y !== null) baselineOf.set(c, y);
  }
  attachPieces(baselineOf, unit);
  const buckets = new Map<number, Component[]>();
  for (const [c, y] of baselineOf) {
    const list = buckets.get(y) ?? [];
    list.push(c);
    buckets.set(y, list);
  }
  return dropLeftStrays(
    [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([y, list]) => {
      let y0 = list[0].y0;
      let y1 = y;
      for (const c of list) {
        if (c.y0 < y0) y0 = c.y0;
        if (c.y1 > y1) y1 = c.y1;
      }
      return { y0, y1, comps: list };
    })
    .filter((b) => {
      let x0 = b.comps[0].x0;
      let x1 = b.comps[0].x1;
      for (const c of b.comps) {
        if (c.x0 < x0) x0 = c.x0;
        if (c.x1 > x1) x1 = c.x1;
      }
      return x1 - x0 >= unit * 1.2 && areaOf(b.comps) >= unit * 0.35;
    }),
    unit,
  );
}

/**
 * A small piece (an i dot, or the top of a letter cut off by the ruling)
 * belongs with the letter directly above or below it, not the nearest line.
 */
function attachPieces(baselineOf: Map<Component, number>, unit: number) {
  const height = (c: Component) => c.y1 - c.y0 + 1;
  const big = [...baselineOf.keys()].filter((c) => height(c) >= unit * 0.35);
  for (const [c, y] of baselineOf) {
    if (height(c) >= unit * 0.35) continue;
    let best: Component | null = null;
    let bestGap = unit * 0.35;
    for (const b of big) {
      const overlap = Math.min(c.x1, b.x1) - Math.max(c.x0, b.x0);
      if (overlap < Math.min(c.x1 - c.x0 + 1, b.x1 - b.x0 + 1) * 0.3) continue;
      const gap = Math.max(b.y0 - c.y1, c.y0 - b.y1, 0);
      if (gap <= bestGap) [best, bestGap] = [b, gap];
    }
    if (best && baselineOf.get(best) !== y) baselineOf.set(c, baselineOf.get(best)!);
  }
}

/**
 * Template rows all start at the same margin. Marks well left of it are the
 * other page of an open notebook or bits of the margin line.
 */
function dropLeftStrays(bands: Band[], unit: number): Band[] {
  if (bands.length < 3) return bands;
  const letterLike = (c: Component) => c.y1 - c.y0 + 1 >= unit * 0.3 && c.x1 - c.x0 + 1 >= unit * 0.2;
  const starts = bands
    .map((b) => b.comps.filter(letterLike).reduce((m, c) => Math.min(m, c.x0), Infinity))
    .filter(Number.isFinite);
  if (starts.length < 3) return bands;
  const start = median(starts);
  return bands
    .map((b) => ({ ...b, comps: b.comps.filter((c) => c.x1 >= start - unit * 0.6 && c.x0 >= start - unit * 1.2) }))
    .filter((b) => b.comps.length > 0);
}

function findBands(comps: Component[], unit: number, h: number): Band[] {
  const coverage = new Uint16Array(h + 1);
  for (const c of comps) for (let y = c.y0; y <= c.y1; y++) coverage[y]++;
  const raw: Array<{ y0: number; y1: number }> = [];
  let start = -1;
  for (let y = 0; y <= h; y++) {
    if (y < h && coverage[y] > 0) {
      if (start < 0) start = y;
    } else if (start >= 0) {
      raw.push({ y0: start, y1: y - 1 });
      start = -1;
    }
  }
  const merged: Array<{ y0: number; y1: number }> = [];
  for (const r of raw) {
    const prev = merged.at(-1);
    if (prev && r.y0 - prev.y1 < unit * 0.35) prev.y1 = r.y1;
    else merged.push({ ...r });
  }
  return merged.map((b) => ({
    ...b,
    comps: comps.filter((c) => c.y0 >= b.y0 && c.y1 <= b.y1),
  }));
}

function overlapClusters(comps: Component[], unit: number): Cluster[] {
  const sorted = [...comps].sort((a, b) => a.x0 - b.x0);
  const clusters: Cluster[] = [];
  const touch = unit * 0.03;
  for (const c of sorted) {
    const last = clusters.at(-1);
    if (last && c.x0 <= last.x1 + touch) {
      last.x1 = Math.max(last.x1, c.x1);
      last.y0 = Math.min(last.y0, c.y0);
      last.y1 = Math.max(last.y1, c.y1);
      last.comps.push(c);
      last.area += c.area;
    } else {
      clusters.push({ x0: c.x0, x1: c.x1, y0: c.y0, y1: c.y1, comps: [c], area: c.area });
    }
  }
  return clusters;
}

/**
 * Matches rows of writing to consecutive guide lines. Rows may be skipped
 * (stray writing); guide lines may only run out at the end of the page.
 * Returns [bandIndex, lineIndex] pairs.
 */
export function alignBands(found: number[], expected: number[]): Array<[number, number]> {
  const B = found.length;
  const L = expected.length;
  const SKIP_ROW = 2.5;
  const cost = (f: number, e: number) => {
    if (f === e) return 0;
    const ratio = f / e;
    if (ratio >= 0.55 && ratio <= 1.6) return 0.7;
    if (ratio > 1.6 && ratio <= 2.2) return 1.4;
    return SKIP_ROW + 1.5;
  };
  const INF = Number.POSITIVE_INFINITY;
  const dp = Array.from({ length: B + 1 }, () => new Float64Array(L + 1).fill(INF));
  const from = Array.from({ length: B + 1 }, () => new Int8Array(L + 1));
  dp[0][0] = 0;
  for (let b = 1; b <= B; b++) {
    for (let l = 0; l <= Math.min(b, L); l++) {
      const skip = dp[b - 1][l] + SKIP_ROW;
      const match = l > 0 ? dp[b - 1][l - 1] + cost(found[b - 1], expected[l - 1]) : INF;
      if (match <= skip) {
        dp[b][l] = match;
        from[b][l] = 1;
      } else {
        dp[b][l] = skip;
        from[b][l] = 0;
      }
    }
  }
  let bestL = 0;
  for (let l = 0; l <= Math.min(B, L); l++) {
    if (dp[B][l] < dp[B][bestL] - 1e-9 || (Math.abs(dp[B][l] - dp[B][bestL]) < 1e-9 && l > bestL)) bestL = l;
  }
  const pairs: Array<[number, number]> = [];
  let l = bestL;
  for (let b = B; b > 0; b--) {
    if (from[b][l] === 1) {
      pairs.push([b - 1, l - 1]);
      l--;
    }
  }
  return pairs.reverse();
}

type ExtractCtx = {
  labels: Int32Array;
  ink: Uint8Array;
  contrast: Uint8Array;
  w: number;
  unit: number;
  ruleYs: number[];
  inkRef: number;
  pageId: string;
};

function extractLine(line: GuideLine, band: Band, clusters: Cluster[], ctx: ExtractCtx): ScannedLine {
  const expected = line.glyphs.length;
  const found = clusters.length;
  const baseline = findBaseline(band, clusters, ctx);
  const fail = (message: string): ScannedLine => ({
    lineNumber: line.number,
    ok: false,
    found,
    expected,
    message,
    glyphs: [],
    crop: captureLine(band, baseline, ctx),
  });

  if (found < expected) {
    return fail(
      `Line ${line.number}: found ${found} of ${expected} characters. Some characters may be touching or too faint.`,
    );
  }

  let suspicious = false;
  while (clusters.length > expected) {
    let best = 0;
    for (let i = 1; i < clusters.length - 1; i++) {
      if (clusters[i + 1].x0 - clusters[i].x1 < clusters[best + 1].x0 - clusters[best].x1) best = i;
    }
    const gap = clusters[best + 1].x0 - clusters[best].x1;
    if (gap > ctx.unit * 0.25) suspicious = true;
    const a = clusters[best];
    const b = clusters[best + 1];
    clusters.splice(best, 2, {
      x0: Math.min(a.x0, b.x0),
      x1: Math.max(a.x1, b.x1),
      y0: Math.min(a.y0, b.y0),
      y1: Math.max(a.y1, b.y1),
      comps: [...a.comps, ...b.comps],
      area: a.area + b.area,
    });
  }
  if (suspicious) {
    return fail(
      `Line ${line.number}: found extra marks (${found} instead of ${expected}). Leave out scribbles and keep a clear gap between characters.`,
    );
  }

  const glyphs = clusters.map((cl, i) => {
    const slot = line.glyphs[i];
    const mask = cropGlyph(cl, ctx);
    return {
      id: `${ctx.pageId}:${line.number}:${i}`,
      char: slot.char,
      variant: slot.variant,
      lineNumber: line.number,
      mask,
      metrics: {
        widthU: mask.width / ctx.unit,
        heightU: mask.height / ctx.unit,
        topU: (cl.y0 - 1 - baseline) / ctx.unit,
      },
    };
  });
  return { lineNumber: line.number, ok: true, found, expected, glyphs };
}

function captureLine(band: Band, baseline: number, ctx: ExtractCtx): LineInk {
  const pageH = ctx.contrast.length / ctx.w;
  let x0 = band.comps[0]?.x0 ?? 0;
  let x1 = band.comps[0]?.x1 ?? 0;
  for (const c of band.comps) {
    if (c.x0 < x0) x0 = c.x0;
    if (c.x1 > x1) x1 = c.x1;
  }
  const pad = 2;
  x0 = Math.max(0, x0 - pad);
  x1 = Math.min(ctx.w - 1, x1 + pad);
  const top = Math.max(band.y0, baseline - ctx.unit * 1.6);
  const bottom = Math.min(band.y1, baseline + ctx.unit * 1.0);
  const y0 = Math.max(0, Math.floor(top) - pad);
  const y1 = Math.min(pageH - 1, Math.ceil(bottom) + pad);
  const width = x1 - x0 + 1;
  const height = y1 - y0 + 1;
  const ink = new Uint8Array(width * height);
  const contrast = new Uint8Array(width * height);
  const own = new Set(band.comps.map((c) => c.id));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const src = (y0 + y) * ctx.w + (x0 + x);
      if (!own.has(ctx.labels[src])) continue;
      ink[y * width + x] = ctx.ink[src];
      contrast[y * width + x] = ctx.contrast[src];
    }
  }
  return { width, height, ink, contrast, baselineY: baseline - y0, unit: ctx.unit, inkRef: ctx.inkRef };
}

function findBaseline(band: Band, clusters: Cluster[], ctx: ExtractCtx): number {
  const bottoms = clusters.map((c) => c.y1);
  const tol = ctx.unit * 0.2;
  let best: number | null = null;
  let bestVotes = 0;
  for (const y of ctx.ruleYs) {
    if (y < band.y0 - tol || y > band.y1 + tol) continue;
    const votes = bottoms.filter((b) => Math.abs(b - y) <= tol).length;
    if (votes > bestVotes) [best, bestVotes] = [y, votes];
  }
  if (best !== null && bestVotes >= Math.max(1, clusters.length * 0.25)) return best;
  return median(bottoms);
}

function cropGlyph(cl: Cluster, ctx: ExtractCtx): GlyphMask {
  const { labels, contrast, w, inkRef } = ctx;
  const ids = new Set(cl.comps.map((c) => c.id));
  const pad = 1;
  const x0 = Math.max(0, cl.x0 - pad);
  const y0 = Math.max(0, cl.y0 - pad);
  const x1 = Math.min(w - 1, cl.x1 + pad);
  const y1 = Math.min(contrast.length / w - 1, cl.y1 + pad);
  const width = x1 - x0 + 1;
  const height = y1 - y0 + 1;
  const data = new Uint8Array(width * height);
  const alpha = (c: number) => Math.min(255, Math.round((c / inkRef) * 255));
  const mine = (x: number, y: number) => ids.has(labels[y * w + x]);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const gx = x0 + x;
      const gy = y0 + y;
      const c = contrast[gy * w + gx];
      if (mine(gx, gy)) {
        data[y * width + x] = Math.max(140, alpha(c));
      } else if (labels[gy * w + gx] === 0 && c > 3 && c <= INK_THRESHOLD) {
        const edge = mine(gx - 1, gy) || mine(gx + 1, gy) || mine(gx, gy - 1) || mine(gx, gy + 1);
        if (edge) data[y * width + x] = Math.round(alpha(c) * 0.8);
      }
    }
  }
  return { width, height, data };
}
