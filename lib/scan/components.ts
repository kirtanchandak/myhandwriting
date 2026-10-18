export type Component = {
  id: number;
  x0: number;
  y0: number;
  /** Inclusive. */
  x1: number;
  y1: number;
  area: number;
};

/** 8-connected labelling. Label 0 is background; component ids start at 1. */
export function labelComponents(mask: Uint8Array, w: number, h: number) {
  const labels = new Int32Array(w * h);
  const components: Component[] = [];
  const stack = new Int32Array(w * h);
  let next = 1;
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || labels[start]) continue;
    const id = next++;
    const c: Component = { id, x0: w, y0: h, x1: -1, y1: -1, area: 0 };
    let sp = 0;
    stack[sp++] = start;
    labels[start] = id;
    while (sp > 0) {
      const p = stack[--sp];
      const x = p % w;
      const y = (p - x) / w;
      c.area++;
      if (x < c.x0) c.x0 = x;
      if (x > c.x1) c.x1 = x;
      if (y < c.y0) c.y0 = y;
      if (y > c.y1) c.y1 = y;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= w) continue;
          const q = ny * w + nx;
          if (mask[q] && !labels[q]) {
            labels[q] = id;
            stack[sp++] = q;
          }
        }
      }
    }
    components.push(c);
  }
  return { labels, components };
}
