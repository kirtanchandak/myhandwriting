export type Ring = Array<[number, number]>;

/** Outlines of the ink. Each ring is in pixel-corner coordinates, y growing downward. */
export function traceContours(data: Uint8Array, width: number, height: number, threshold = 140): Ring[] {
  const on = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < width && y < height && data[y * width + x] >= threshold;
  const outgoing = new Map<string, Array<[number, number]>>();
  const add = (x1: number, y1: number, x2: number, y2: number) => {
    const key = `${x1},${y1}`;
    const list = outgoing.get(key);
    if (list) list.push([x2, y2]);
    else outgoing.set(key, [[x2, y2]]);
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!on(x, y)) continue;
      if (!on(x, y - 1)) add(x, y, x + 1, y);
      if (!on(x + 1, y)) add(x + 1, y, x + 1, y + 1);
      if (!on(x, y + 1)) add(x + 1, y + 1, x, y + 1);
      if (!on(x - 1, y)) add(x, y + 1, x, y);
    }
  }

  const contours: Ring[] = [];
  for (const startKey of [...outgoing.keys()]) {
    while ((outgoing.get(startKey)?.length ?? 0) > 0) {
      const ring: Ring = [];
      let key = startKey;
      let closed = false;
      for (let guard = 0; guard < width * height * 8; guard++) {
        const outs = outgoing.get(key);
        if (!outs?.length) break;
        const next = outs.pop()!;
        const [x, y] = key.split(",").map(Number);
        ring.push([x, y]);
        const nextKey = `${next[0]},${next[1]}`;
        if (nextKey === startKey) {
          closed = true;
          break;
        }
        key = nextKey;
      }
      if (closed && ring.length >= 3) contours.push(simplify(ring, 0.75));
    }
  }
  return contours;
}

/** Drops points that barely change the outline. The ring stays closed implicitly. */
export function simplify(points: Ring, epsilon: number): Ring {
  if (points.length < 4) return points;
  const keep = new Array(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;
  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let far = 0;
    let at = -1;
    for (let i = a + 1; i < b; i++) {
      const d = distance(points[i], points[a], points[b]);
      if (d > far) {
        far = d;
        at = i;
      }
    }
    if (at >= 0 && far > epsilon) {
      keep[at] = true;
      stack.push([a, at], [at, b]);
    }
  }
  const out = points.filter((_, i) => keep[i]);
  return out.length >= 3 ? out : points;
}

function distance(p: [number, number], a: [number, number], b: [number, number]): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  if (len === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  return Math.abs(dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]) / len;
}
