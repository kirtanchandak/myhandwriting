/**
 * Generates synthetic phone-photo-like notebook pages written according to the
 * default guide: public/samples/page-1.jpg (lines 1-15) and page-2.jpg (16-29).
 * Run: pnpm tsx scripts/make-samples.ts  (needs the macOS "Bradley Hand" font)
 */
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import { mkdirSync, writeFileSync } from "node:fs";
import { buildGuide } from "../lib/template/guide";
import { mulberry32 } from "../lib/render/layout";

const FONT = "/System/Library/Fonts/Supplemental/Bradley Hand Bold.ttf";
GlobalFonts.registerFromPath(FONT, "Hand");

const W = 1300;
const H = 1800;
const RULE = 52;
const FIRST_RULE = 120;
const MARGIN_X = 130;

function page(lines: ReturnType<typeof buildGuide>["lines"], seed: number, tiltDeg: number) {
  const rand = mulberry32(seed);
  const paper = createCanvas(W, H);
  const p = paper.getContext("2d");
  p.fillStyle = "#fbf9f2";
  p.fillRect(0, 0, W, H);
  p.strokeStyle = "rgb(150, 185, 225)";
  p.lineWidth = 2;
  for (let y = FIRST_RULE; y < H - 40; y += RULE) {
    p.beginPath();
    p.moveTo(0, y);
    p.lineTo(W, y);
    p.stroke();
  }
  p.strokeStyle = "rgb(230, 140, 140)";
  p.beginPath();
  p.moveTo(MARGIN_X, 0);
  p.lineTo(MARGIN_X, H);
  p.stroke();

  p.fillStyle = "rgb(22, 30, 78)";
  lines.forEach((line, i) => {
    const baseline = FIRST_RULE + RULE * 2 * i + RULE;
    let x = MARGIN_X + 40;
    line.chars.forEach((ch, ci) => {
      if (ci > 0) x += 44;
      for (let v = 0; v < 3; v++) {
        const size = 44 * (1 + (rand() - 0.5) * 0.12);
        p.font = `${size}px Hand`;
        const w = p.measureText(ch).width;
        p.save();
        p.translate(x, baseline + (rand() - 0.5) * 3);
        p.rotate(((rand() - 0.5) * 6 * Math.PI) / 180);
        p.fillText(ch, 0, 0);
        p.restore();
        x += w + 26 + rand() * 10;
      }
    });
  });

  const photo = createCanvas(W, H);
  const c = photo.getContext("2d");
  c.fillStyle = "#6b6258";
  c.fillRect(0, 0, W, H);
  c.translate(W / 2, H / 2);
  c.rotate((tiltDeg * Math.PI) / 180);
  c.scale(0.96, 0.96);
  c.drawImage(paper, -W / 2, -H / 2);
  c.setTransform(1, 0, 0, 1, 0, 0);
  const light = c.createLinearGradient(0, 0, W, H);
  light.addColorStop(0, "rgba(255,255,255,0.05)");
  light.addColorStop(1, "rgba(0,0,0,0.18)");
  c.fillStyle = light;
  c.fillRect(0, 0, W, H);

  const img = c.getImageData(0, 0, W, H);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rand() - 0.5) * 14;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  c.putImageData(img, 0, 0);
  return photo.toBuffer("image/jpeg", 88);
}

const guide = buildGuide();
mkdirSync("public/samples", { recursive: true });
writeFileSync("public/samples/page-1.jpg", page(guide.lines.slice(0, 15), 11, 1.6));
writeFileSync("public/samples/page-2.jpg", page(guide.lines.slice(15), 23, -2.1));
console.log("wrote public/samples/page-1.jpg, page-2.jpg");
