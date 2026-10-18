import { createCanvas, loadImage } from "@napi-rs/canvas";
import { readFileSync, writeFileSync } from "node:fs";
import { buildGuide } from "../lib/template/guide";
import { rgbaToGray, localContrast, threshold, estimateSkew, deskew } from "../lib/scan/image";
import { removeRules } from "../lib/scan/rules";
import { scanPage } from "../lib/scan/scanPage";

const path = process.argv[2] ?? "public/samples/page-1.jpg";
const img = await loadImage(readFileSync(path));
const canvas = createCanvas(img.width, img.height);
const ctx = canvas.getContext("2d");
ctx.drawImage(img, 0, 0);
const { data } = ctx.getImageData(0, 0, img.width, img.height);
const gray = rgbaToGray(data, img.width, img.height);
const w = img.width;
const h = img.height;
const radius = Math.max(7, Math.round(Math.min(w, h) / 60));
const m0 = threshold(localContrast(gray, radius), 14);
const skew = estimateSkew(m0, w, h);
const g2 = deskew(gray, skew);
const c2 = localContrast(g2, radius);
const m2 = threshold(c2, 14);
const r = removeRules(m2, c2, w, h);
console.log({ skewDeg: (skew * 180) / Math.PI, rules: r.ruleYs.length, spacing: r.spacing });

const out = ctx.createImageData(w, h);
for (let i = 0; i < w * h; i++) {
  const v = r.ink[i] ? 0 : m2[i] ? 180 : 255;
  out.data[i * 4] = v;
  out.data[i * 4 + 1] = v;
  out.data[i * 4 + 2] = r.ink[i] ? 0 : 255;
  out.data[i * 4 + 3] = 255;
}
ctx.putImageData(out, 0, 0);
writeFileSync("/tmp/debug-ink.png", canvas.toBuffer("image/png"));

const scan = scanPage(gray, buildGuide(), Number(process.argv[3] ?? 1));
console.log({ ok: scan.ok, msg: scan.message, unit: scan.unitPx, extra: scan.extraRows });
for (const l of scan.lines) console.log(l.lineNumber, l.ok, l.found, l.expected, l.message ?? "");

if (process.argv[4]) {
  const { labelComponents } = await import("../lib/scan/components");
  const { components } = labelComponents(r.ink, w, h);
  const [ya, yb] = process.argv[4].split("-").map(Number);
  console.log(
    components
      .filter((c) => c.y0 >= ya && c.y1 <= yb)
      .map((c) => `${c.x0},${c.y0} ${c.x1 - c.x0 + 1}x${c.y1 - c.y0 + 1} a=${c.area}`),
  );
}
