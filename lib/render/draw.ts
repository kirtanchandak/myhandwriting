import type { GlyphMask } from "@/lib/scan/scanPage";
import type { TextLayout } from "./layout";

export type Paper = "ruled" | "plain" | "transparent";
export type DrawStyle = { ink: string; paper: Paper };

const PAPER_COLOR = "#fffdf6";
const RULE_COLOR = "rgba(84, 134, 196, 0.35)";

const tintCache = new WeakMap<GlyphMask, Map<string, HTMLCanvasElement>>();

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const n = m ? parseInt(m[1], 16) : 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function tintedGlyph(mask: GlyphMask, ink: string): HTMLCanvasElement {
  let byColor = tintCache.get(mask);
  if (!byColor) tintCache.set(mask, (byColor = new Map()));
  const hit = byColor.get(ink);
  if (hit) return hit;
  const canvas = document.createElement("canvas");
  canvas.width = mask.width;
  canvas.height = mask.height;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(mask.width, mask.height);
  const [r, g, b] = hexToRgb(ink);
  for (let i = 0; i < mask.data.length; i++) {
    img.data[i * 4] = r;
    img.data[i * 4 + 1] = g;
    img.data[i * 4 + 2] = b;
    img.data[i * 4 + 3] = mask.data[i];
  }
  ctx.putImageData(img, 0, 0);
  byColor.set(ink, canvas);
  return canvas;
}

export function drawLayout(
  canvas: HTMLCanvasElement,
  layout: TextLayout,
  masks: ReadonlyMap<string, GlyphMask>,
  style: DrawStyle,
  pixelRatio = 1,
) {
  canvas.width = Math.round(layout.width * pixelRatio);
  canvas.height = Math.round(layout.height * pixelRatio);
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  ctx.clearRect(0, 0, layout.width, layout.height);
  if (style.paper !== "transparent") {
    ctx.fillStyle = PAPER_COLOR;
    ctx.fillRect(0, 0, layout.width, layout.height);
  }
  if (style.paper === "ruled") {
    ctx.strokeStyle = RULE_COLOR;
    ctx.lineWidth = 1;
    for (const y of ruledLines(layout)) {
      ctx.beginPath();
      ctx.moveTo(0, Math.round(y) + 0.5);
      ctx.lineTo(layout.width, Math.round(y) + 0.5);
      ctx.stroke();
    }
  }
  ctx.imageSmoothingQuality = "high";
  for (const p of layout.placed) {
    const mask = masks.get(p.glyph.id);
    if (!mask) continue;
    ctx.save();
    ctx.translate(p.x + p.w / 2, p.y + p.h / 2);
    ctx.rotate(p.rotation);
    ctx.drawImage(tintedGlyph(mask, style.ink), -p.w / 2, -p.h / 2, p.w, p.h);
    ctx.restore();
  }
}

function ruledLines(layout: TextLayout): number[] {
  const b = layout.baselines;
  const pitch = b.length > 1 ? b[1] - b[0] : 64;
  const ys: number[] = [];
  for (let y = b[0] % pitch; y < layout.height; y += pitch) ys.push(y);
  return ys;
}

export function layoutToSvg(
  layout: TextLayout,
  masks: ReadonlyMap<string, GlyphMask>,
  style: DrawStyle,
  title: string,
): string {
  const urls = new Map<string, string>();
  const parts: string[] = [];
  if (style.paper !== "transparent") {
    parts.push(`<rect width="100%" height="100%" fill="${PAPER_COLOR}"/>`);
  }
  if (style.paper === "ruled") {
    for (const y of ruledLines(layout)) {
      parts.push(
        `<line x1="0" x2="${layout.width}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#5486c4" stroke-opacity="0.35"/>`,
      );
    }
  }
  for (const p of layout.placed) {
    const mask = masks.get(p.glyph.id);
    if (!mask) continue;
    let href = urls.get(p.glyph.id);
    if (!href) {
      href = tintedGlyph(mask, style.ink).toDataURL("image/png");
      urls.set(p.glyph.id, href);
    }
    const cx = p.x + p.w / 2;
    const cy = p.y + p.h / 2;
    const deg = (p.rotation * 180) / Math.PI;
    parts.push(
      `<image href="${href}" x="${p.x.toFixed(2)}" y="${p.y.toFixed(2)}" width="${p.w.toFixed(2)}" height="${p.h.toFixed(2)}" transform="rotate(${deg.toFixed(2)} ${cx.toFixed(2)} ${cy.toFixed(2)})"/>`,
    );
  }
  const esc = title.replace(/[<>&"]/g, (c) => `&#${c.charCodeAt(0)};`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}" height="${layout.height}" viewBox="0 0 ${layout.width} ${layout.height}" role="img"><title>${esc}</title>${parts.join("")}</svg>`;
}

export function maskToDataUrl(mask: GlyphMask, ink: string): string {
  return tintedGlyph(mask, ink).toDataURL("image/png");
}
