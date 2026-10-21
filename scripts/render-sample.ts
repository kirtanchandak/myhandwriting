/**
 * Renders a sentence in a published hand, before and after the repair pass,
 * so changes to lib/repair can be judged by eye.
 * Run: pnpm render-sample [slug] [text]  -> tmp/render-before.png, tmp/render-raw.png, tmp/render-pen.png
 */
import { createCanvas, type SKRSContext2D } from "@napi-rs/canvas";
import { mkdirSync, writeFileSync } from "node:fs";
import { bankFromGlyphs } from "../lib/bank/bank";
import { publicHand } from "../lib/db/fonts";
import { repairFont } from "../lib/repair";
import { DEFAULT_LAYOUT, layoutText, type LayoutOptions, type RenderBank, type TextLayout } from "../lib/render/layout";
import type { GlyphMask } from "../lib/scan/scanPage";
import { decodeGlyph } from "../lib/store/library";

const slug = process.argv[2] ?? "kirtan";
const text = process.argv[3] ?? "I am Kirtan and I am a good person";
const hand = publicHand(slug);
if (!hand) throw new Error(`No published hand "${slug}".`);
const decoded = hand.glyphs.map(decodeGlyph);
const base = { ...DEFAULT_LAYOUT, width: 1100, size: 90, wobble: 0.6, seed: 3 };

function draw(layout: TextLayout, masks: ReadonlyMap<string, GlyphMask>, file: string) {
  const canvas = createCanvas(layout.width, layout.height);
  const ctx = canvas.getContext("2d") as SKRSContext2D;
  ctx.fillStyle = "#fffdf6";
  ctx.fillRect(0, 0, layout.width, layout.height);
  ctx.strokeStyle = "rgba(84, 134, 196, 0.35)";
  for (const y of layout.baselines) {
    ctx.beginPath();
    ctx.moveTo(0, Math.round(y) + 0.5);
    ctx.lineTo(layout.width, Math.round(y) + 0.5);
    ctx.stroke();
  }
  for (const p of layout.placed) {
    const mask = masks.get(p.glyph.id);
    if (!mask) continue;
    const tile = createCanvas(mask.width, mask.height);
    const img = tile.getContext("2d").createImageData(mask.width, mask.height);
    for (let i = 0; i < mask.data.length; i++) {
      img.data[i * 4] = 0x1f;
      img.data[i * 4 + 1] = 0x3b;
      img.data[i * 4 + 2] = 0x8f;
      img.data[i * 4 + 3] = mask.data[i];
    }
    tile.getContext("2d").putImageData(img, 0, 0);
    ctx.save();
    ctx.translate(p.x + p.w / 2, p.y + p.h / 2);
    ctx.rotate(p.rotation);
    ctx.drawImage(tile, -p.w / 2, -p.h / 2, p.w, p.h);
    ctx.restore();
  }
  writeFileSync(file, canvas.toBuffer("image/png"));
  console.log(file);
}

function render(bank: RenderBank, masks: ReadonlyMap<string, GlyphMask>, file: string, extra: Partial<LayoutOptions> = {}) {
  draw(layoutText(text, bank, { ...base, ...extra }), masks, file);
}

mkdirSync("tmp", { recursive: true });
render(bankFromGlyphs(decoded), new Map(decoded.map((g) => [g.id, g.mask])), "tmp/render-before.png");
for (const pen of [false, true]) {
  const font = repairFont(decoded, { pen });
  render(font.bank, font.masks, `tmp/render-${pen ? "pen" : "raw"}.png`, font.layout);
}
