import { rgbaToGray, type Gray } from "./image";

/** Working resolution for detection and glyph crops. */
export const MAX_EDGE = 1800;

export type LoadedPhoto = { gray: Gray; previewUrl: string };

const HEIC_BRANDS = ["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"];

/** iPhone photos are HEIC. Chrome cannot decode them, so the name, type, or file header has to say so. */
export function looksLikeHeic(type: string, name: string, header: Uint8Array): boolean {
  if (/heic|heif/i.test(type) || /\.(heic|heif)$/i.test(name)) return true;
  if (header.length < 12) return false;
  const tag = String.fromCharCode(...header.slice(4, 12));
  return tag.startsWith("ftyp") && HEIC_BRANDS.some((brand) => tag.slice(4, 8).toLowerCase() === brand);
}

/** Decodes a photo in the browser and downscales it. HEIC is converted locally. Nothing leaves the device. */
export async function loadPhoto(source: Blob, name = ""): Promise<LoadedPhoto> {
  const header = new Uint8Array(await source.slice(0, 12).arrayBuffer());
  const bitmap = await decodeBitmap(source, name, header);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Could not read this photo.");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const { data } = ctx.getImageData(0, 0, width, height);
  const preview = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not preview this photo."))), "image/jpeg", 0.8);
  });
  return { gray: rgbaToGray(data, width, height), previewUrl: URL.createObjectURL(preview) };
}

async function decodeBitmap(source: Blob, name: string, header: Uint8Array): Promise<ImageBitmap> {
  const heic = looksLikeHeic(source.type, name, header);
  if (!heic) return createImageBitmap(source, { imageOrientation: "from-image" });
  try {
    return await createImageBitmap(source, { imageOrientation: "from-image" });
  } catch {
    const { heicTo } = await import("heic-to/next");
    return heicTo({ blob: source, type: "bitmap", options: { imageOrientation: "from-image" } });
  }
}
