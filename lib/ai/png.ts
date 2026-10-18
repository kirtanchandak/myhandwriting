import type { LineInk } from "@/lib/scan/scanPage";

/** White page, dark ink, scaled up so a short line is legible to the model. */
export function cropToPng(crop: LineInk): string {
  const scale = crop.height < 80 ? 3 : crop.height < 140 ? 2 : 1;
  const src = document.createElement("canvas");
  src.width = crop.width;
  src.height = crop.height;
  const srcCtx = src.getContext("2d");
  if (!srcCtx) throw new Error("Could not draw this line.");
  const img = srcCtx.createImageData(crop.width, crop.height);
  for (let i = 0; i < crop.ink.length; i++) {
    const v = crop.ink[i] ? 25 : 255;
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v;
    img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  srcCtx.putImageData(img, 0, 0);

  const canvas = document.createElement("canvas");
  canvas.width = crop.width * scale;
  canvas.height = crop.height * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not draw this line.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
  const url = canvas.toDataURL("image/png");
  return url.slice(url.indexOf(",") + 1);
}
