import type { GlyphMask, ScannedGlyph } from "@/lib/scan/scanPage";
import { simplify, type Ring } from "./trace";

const SCALE = 3;

export type Stroke = { points: Ring; closed: boolean };

/**
 * Redraws a scanned letter with one round nib. The ink is thinned to its centre
 * line, small stray branches are cut off, the line is smoothed into strokes and
 * drawn back out at a steady width, the way a ballpoint pen is.
 *
 * `nibU` is the stroke width in rule units, so letters of different sizes get the same weight.
 */
export function penGlyph(glyph: ScannedGlyph, nibU = 0.064): ScannedGlyph {
  const { width, height } = glyph.mask;
  if (width < 2 || height < 2 || !(glyph.metrics.widthU > 0)) return glyph;
  const unit = width / glyph.metrics.widthU;
  const strokes = penStrokes(glyph.mask);
  if (strokes.length === 0) return glyph;
  const radius = Math.max(0.6, (nibU * unit) / 2);
  const pad = Math.ceil(radius) + 1;
  const mask = drawStrokes(strokes, width + pad * 2, height + pad * 2, pad, radius, SCALE);
  return {
    ...glyph,
    mask,
    metrics: {
      ...glyph.metrics,
      widthU: mask.width / (unit * SCALE),
      heightU: mask.height / (unit * SCALE),
      topU: glyph.metrics.topU - pad / unit,
    },
  };
}

/** Smoothed centre-line strokes of the ink, in pixel coordinates of the mask. */
export function penStrokes(mask: GlyphMask): Stroke[] {
  const { width, height, data } = mask;
  const ink = new Uint8Array(width * height);
  for (let i = 0; i < data.length; i++) ink[i] = data[i] >= 140 ? 1 : 0;
  const skeleton = thin(ink, width, height);
  const maxSpur = Math.max(2, height * 0.15);
  pruneSpurs(skeleton, ink, width, height, maxSpur);
  pruneSpurs(skeleton, ink, width, height, maxSpur);
  const strokes = traceStrokes(skeleton, width, height);
  strokes.push(...lostArms(strokes, skeleton, ink, width, height));
  return strokes.map((s) => ({ closed: s.closed, points: smoothStroke(s.points, s.closed) }));
}

/**
 * Thinning eats short, thick arms, like the left half of the bar of a `t`.
 * Ink that ends up well outside the centre line gets a stroke from the line
 * out to its far end.
 */
function lostArms(strokes: Stroke[], skeleton: Uint8Array, ink: Uint8Array, w: number, h: number): Stroke[] {
  const centre = strokes.flatMap((s) => s.points);
  if (centre.length === 0) return [];
  const widths: number[] = [];
  for (let i = 0; i < skeleton.length; i++) if (skeleton[i]) widths.push(halfWidth(ink, w, h, i));
  widths.sort((a, b) => a - b);
  const half = widths[widths.length >> 1];
  const limit = half * 1.6 + 1;
  const nearest = (x: number, y: number) => {
    let best = Infinity;
    let at = centre[0];
    for (const p of centre) {
      const d = Math.hypot(p[0] - x, p[1] - y);
      if (d < best) {
        best = d;
        at = p;
      }
    }
    return { d: best, at };
  };
  const far = new Map<number, { d: number; at: [number, number] }>();
  for (let i = 0; i < ink.length; i++) {
    if (!ink[i]) continue;
    const n = nearest((i % w) + 0.5, Math.floor(i / w) + 0.5);
    if (n.d > limit) far.set(i, n);
  }
  const arms: Stroke[] = [];
  const seen = new Set<number>();
  for (const start of far.keys()) {
    if (seen.has(start)) continue;
    const group: number[] = [];
    const queue = [start];
    seen.add(start);
    while (queue.length) {
      const i = queue.pop()!;
      group.push(i);
      const x = i % w;
      const y = (i - x) / w;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const j = (y + dy) * w + x + dx;
          if (x + dx < 0 || y + dy < 0 || x + dx >= w || y + dy >= h || seen.has(j) || !far.has(j)) continue;
          seen.add(j);
          queue.push(j);
        }
      }
    }
    if (group.length < 3) continue;
    const tip = group.reduce((a, b) => (far.get(b)!.d > far.get(a)!.d ? b : a));
    const { d, at } = far.get(tip)!;
    const tx = (tip % w) + 0.5;
    const ty = Math.floor(tip / w) + 0.5;
    const pull = Math.min(half, d * 0.5) / d;
    arms.push({ points: [at, [tx + (at[0] - tx) * pull, ty + (at[1] - ty) * pull]], closed: false });
  }
  return arms;
}

function smoothStroke(points: Ring, closed: boolean): Ring {
  if (points.length < 3) return points;
  let p = average(points, closed);
  p = chaikin(chaikin(p, closed), closed);
  return closed ? p : simplify(p, 0.15);
}

function average(points: Ring, closed: boolean): Ring {
  const n = points.length;
  const reach = 2;
  return points.map((pt, i) => {
    if (!closed && (i === 0 || i === n - 1)) return pt;
    let sx = 0;
    let sy = 0;
    let count = 0;
    for (let d = -reach; d <= reach; d++) {
      let j = i + d;
      if (closed) j = (j + n) % n;
      else if (j < 0 || j >= n) continue;
      sx += points[j][0];
      sy += points[j][1];
      count++;
    }
    return [sx / count, sy / count];
  });
}

function chaikin(points: Ring, closed: boolean): Ring {
  const n = points.length;
  if (n < 3) return points;
  const out: Ring = closed ? [] : [points[0]];
  const segments = closed ? n : n - 1;
  for (let i = 0; i < segments; i++) {
    const [ax, ay] = points[i];
    const [bx, by] = points[(i + 1) % n];
    out.push([ax * 0.75 + bx * 0.25, ay * 0.75 + by * 0.25], [ax * 0.25 + bx * 0.75, ay * 0.25 + by * 0.75]);
  }
  if (!closed) out.push(points[n - 1]);
  return out;
}

/**
 * Neighbours on the centre line. A diagonal only counts when neither pixel beside
 * it is set, so a stair step is one path rather than a small triangle.
 */
function neighbours(img: Uint8Array, w: number, h: number, i: number): number[] {
  const x = i % w;
  const y = (i - x) / w;
  const on = (xx: number, yy: number) => xx >= 0 && yy >= 0 && xx < w && yy < h && img[yy * w + xx] === 1;
  const out: number[] = [];
  for (const [dx, dy] of [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0],
  ]) {
    if (on(x + dx, y + dy)) out.push((y + dy) * w + x + dx);
  }
  for (const [dx, dy] of [
    [1, -1],
    [1, 1],
    [-1, 1],
    [-1, -1],
  ]) {
    if (on(x + dx, y + dy) && !on(x + dx, y) && !on(x, y + dy)) out.push((y + dy) * w + x + dx);
  }
  return out;
}

/** Distance from a pixel to the nearest pixel without ink: half the stroke width there. */
function halfWidth(ink: Uint8Array, w: number, h: number, i: number): number {
  const x = i % w;
  const y = (i - x) / w;
  let best = Infinity;
  for (let r = 1; r <= 12 && r <= best; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const xx = x + dx;
        const yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < w && yy < h && ink[yy * w + xx]) continue;
        best = Math.min(best, Math.hypot(dx, dy));
      }
    }
  }
  return Number.isFinite(best) ? best : 12;
}

/**
 * Cuts off branches from a loose end to a junction that stay inside the stroke
 * they hang off. Those come from bumps in the outline, not from the pen. Real
 * arms, such as the bar of a `t`, reach well past the stroke and are kept.
 */
function pruneSpurs(img: Uint8Array, ink: Uint8Array, w: number, h: number, maxLength: number) {
  const remove: number[] = [];
  for (let i = 0; i < img.length; i++) {
    if (!img[i] || neighbours(img, w, h, i).length !== 1) continue;
    const path = [i];
    let prev = -1;
    let cur = i;
    let reachedJunction = false;
    while (path.length <= maxLength) {
      const next = neighbours(img, w, h, cur).filter((n) => n !== prev);
      if (next.length !== 1) {
        reachedJunction = next.length > 1;
        break;
      }
      prev = cur;
      cur = next[0];
      if (neighbours(img, w, h, cur).length > 2) {
        reachedJunction = true;
        break;
      }
      path.push(cur);
    }
    if (!reachedJunction || path.length >= maxLength) continue;
    const reach = Math.hypot((i % w) - (cur % w), Math.floor(i / w) - Math.floor(cur / w));
    if (reach <= halfWidth(ink, w, h, cur) * 1.5 + 1) remove.push(...path);
  }
  for (const i of remove) img[i] = 0;
}

function traceStrokes(img: Uint8Array, w: number, h: number): Stroke[] {
  const adj = new Map<number, number[]>();
  for (let i = 0; i < img.length; i++) if (img[i]) adj.set(i, neighbours(img, w, h, i));
  const used = new Set<number>();
  const edge = (a: number, b: number) => (a < b ? a * img.length + b : b * img.length + a);
  const point = (i: number): [number, number] => [(i % w) + 0.5, Math.floor(i / w) + 0.5];
  const strokes: Stroke[] = [];

  const walk = (start: number, first: number): Stroke => {
    const chain = [start, first];
    used.add(edge(start, first));
    let prev = start;
    let cur = first;
    while (adj.get(cur)!.length === 2) {
      const next = adj.get(cur)!.find((n) => n !== prev)!;
      if (used.has(edge(cur, next))) break;
      used.add(edge(cur, next));
      if (next === start) return { points: chain.map(point), closed: true };
      chain.push(next);
      prev = cur;
      cur = next;
    }
    return { points: chain.map(point), closed: false };
  };

  for (const [i, list] of adj) {
    if (list.length === 0) strokes.push({ points: [point(i)], closed: false });
    if (list.length === 2) continue;
    for (const n of list) if (!used.has(edge(i, n))) strokes.push(walk(i, n));
  }
  for (const [i, list] of adj) {
    for (const n of list) if (!used.has(edge(i, n))) strokes.push(walk(i, n));
  }
  return strokes;
}

/** Draws the strokes with round caps and joins, anti-aliased, at `scale` times the size. */
export function drawStrokes(
  strokes: readonly Stroke[],
  width: number,
  height: number,
  offset: number,
  radius: number,
  scale: number,
): GlyphMask {
  const w = width * scale;
  const h = height * scale;
  const out = new Uint8Array(w * h);
  const r = radius * scale;
  const stamp = (ax: number, ay: number, bx: number, by: number) => {
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - r - 1));
    const x1 = Math.min(w - 1, Math.ceil(Math.max(ax, bx) + r + 1));
    const y0 = Math.max(0, Math.floor(Math.min(ay, by) - r - 1));
    const y1 = Math.min(h - 1, Math.ceil(Math.max(ay, by) + r + 1));
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const px = x + 0.5 - ax;
        const py = y + 0.5 - ay;
        const t = len2 > 0 ? Math.min(1, Math.max(0, (px * dx + py * dy) / len2)) : 0;
        const d = Math.hypot(px - t * dx, py - t * dy);
        const a = Math.round(Math.min(1, Math.max(0, r - d + 0.5)) * 255);
        const k = y * w + x;
        if (a > out[k]) out[k] = a;
      }
    }
  };
  for (const { points, closed } of strokes) {
    const pts = points.map(([x, y]) => [(x + offset) * scale, (y + offset) * scale]);
    if (pts.length === 1) stamp(pts[0][0], pts[0][1], pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) stamp(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
    if (closed && pts.length > 2) stamp(pts.at(-1)![0], pts.at(-1)![1], pts[0][0], pts[0][1]);
  }
  return { width: w, height: h, data: out };
}

/** Zhang-Suen thinning. Leaves a one-pixel centre line of the ink. */
function thin(src: Uint8Array, w: number, h: number): Uint8Array {
  const img = src.slice();
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : img[y * w + x]);
  let changed = true;
  while (changed) {
    changed = false;
    for (let step = 0; step < 2; step++) {
      const remove: number[] = [];
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (!img[y * w + x]) continue;
          const p = [at(x, y - 1), at(x + 1, y - 1), at(x + 1, y), at(x + 1, y + 1), at(x, y + 1), at(x - 1, y + 1), at(x - 1, y), at(x - 1, y - 1)];
          const neighbours = p.reduce((n, v) => n + v, 0);
          if (neighbours < 2 || neighbours > 6) continue;
          let turns = 0;
          for (let i = 0; i < 8; i++) if (p[i] === 0 && p[(i + 1) % 8] === 1) turns++;
          if (turns !== 1) continue;
          const [p2, , p4, , p6, , p8] = p;
          if (step === 0) {
            if (p2 * p4 * p6 !== 0 || p4 * p6 * p8 !== 0) continue;
          } else if (p2 * p4 * p8 !== 0 || p2 * p6 * p8 !== 0) continue;
          remove.push(y * w + x);
        }
      }
      if (remove.length) changed = true;
      for (const i of remove) img[i] = 0;
    }
  }
  return img;
}
