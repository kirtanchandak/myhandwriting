import { createCanvas, loadImage } from "@napi-rs/canvas";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { labelRows } from "../lib/ai/label";
import { readLine } from "../lib/ai/openrouter";
import { buildGuide } from "../lib/template/guide";
import { rgbaToGray } from "../lib/scan/image";
import { scanPage, type LineInk } from "../lib/scan/scanPage";

const [path, ...models] = process.argv.slice(2);
const style = process.env.STYLE ?? "ink";
const key = process.env.OPENROUTER_API_KEY;
if (!path || !models.length || !key) throw new Error("usage: bench-models <photo> <model...> (needs OPENROUTER_API_KEY)");

function stripPng(row: LineInk, mode: string): string {
  const scale = row.height < 80 ? 3 : row.height < 140 ? 2 : 1;
  const src = createCanvas(row.width, row.height);
  const sctx = src.getContext("2d");
  const img = sctx.createImageData(row.width, row.height);
  for (let i = 0; i < row.ink.length; i++) {
    const v =
      mode === "ink" ? (row.ink[i] ? 25 : 255) : Math.max(0, 255 - Math.round((row.contrast[i] / row.inkRef) * 230));
    img.data.set([v, v, v, 255], i * 4);
  }
  sctx.putImageData(img, 0, 0);
  const out = createCanvas(row.width * scale, row.height * scale);
  const octx = out.getContext("2d");
  octx.fillStyle = "#fff";
  octx.fillRect(0, 0, out.width, out.height);
  octx.drawImage(src, 0, 0, out.width, out.height);
  return out.toBuffer("image/png").toString("base64");
}

function dumpGlyphs(labels: ReturnType<typeof labelRows>, file: string) {
  const cell = 56;
  const rowH = cell + 18;
  const canvas = createCanvas(cell * 10, rowH * labels.length);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = "13px sans-serif";
  labels.forEach((label, r) => {
    label.glyphs?.forEach((g, i) => {
      const { width, height, data } = g.mask;
      const img = ctx.createImageData(width, height);
      for (let k = 0; k < data.length; k++) img.data.set([0, 0, 0, data[k]], k * 4);
      const src = createCanvas(width, height);
      src.getContext("2d").putImageData(img, 0, 0);
      const s = Math.min((cell - 6) / width, (cell - 6) / height, 2);
      ctx.drawImage(src, i * cell + 3, r * rowH + 3, width * s, height * s);
      ctx.fillStyle = "#c00";
      ctx.fillText(g.char, i * cell + 3, r * rowH + cell + 12);
      ctx.fillStyle = "#000";
    });
  });
  writeFileSync(file, canvas.toBuffer("image/png"));
}

(async () => {
  const img = await loadImage(readFileSync(path));
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);
  const gray = rgbaToGray(ctx.getImageData(0, 0, img.width, img.height).data, img.width, img.height);
  const guide = buildGuide();
  const scan = scanPage(gray, guide);
  mkdirSync("/tmp/strips", { recursive: true });
  const pngs = scan.rows.map((row, i) => {
    const png = stripPng(row, style);
    writeFileSync(`/tmp/strips/${style}-${String(i).padStart(2, "0")}.png`, Buffer.from(png, "base64"));
    return png;
  });
  console.log(`${scan.rows.length} rows, style=${style}`);

  for (const model of models) {
    const t0 = Date.now();
    const cacheFile = `/tmp/reads-${model.replace(/\W/g, "_")}.json`;
    const reads: Array<string[] | string> = process.env.REUSE
      ? JSON.parse(readFileSync(cacheFile, "utf8"))
      : await Promise.all(
      pngs.map((png) =>
        Promise.race([
          readLine(png, key, model, guide.variants),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timed out")), 90_000)),
        ]).catch((e: Error) => `ERR ${e.message}`),
      ),
    );
    writeFileSync(cacheFile, JSON.stringify(reads));
    let exact = 0;
    let snapped = 0;
    let usable = 0;
    const lines: string[] = [];
    const labels = labelRows(
      reads.map((r) => (typeof r === "string" ? [] : r)),
      scan.rows,
      guide,
      "p",
    );
    reads.forEach((read, i) => {
      if (typeof read === "string") {
        lines.push(`  ${i}: ${read}`);
        return;
      }
      const label = labels[i];
      const want = label.lineNumber ? guide.lines[label.lineNumber - 1].glyphs.map((g) => g.char).join("") : "";
      if (want === read.join("")) exact++;
      if (label.lineNumber) snapped++;
      if (label.glyphs) usable++;
      lines.push(
        `  ${i}: ${read.join("")}${label.lineNumber ? `  -> line ${label.lineNumber} ${want}` : "  -> no match"}${label.glyphs ? "" : "  (not cut)"}`,
      );
    });
    console.log(
      `\n${model}: exact ${exact}/${reads.length}, matched ${snapped}, usable ${usable}, ${((Date.now() - t0) / 1000).toFixed(1)}s`,
    );
    if (process.env.VERBOSE) console.log(lines.join("\n"));
    if (process.env.DUMP) dumpGlyphs(labels, `/tmp/glyphs-${model.replace(/\W/g, "_")}.png`);
  }
  process.exit(0);
})();
