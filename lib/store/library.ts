import type { ScannedGlyph } from "@/lib/scan/scanPage";

export const LIBRARY_KEY = "myhandwriting.library";

export type StoredGlyph = {
  id: string;
  char: string;
  variant: number;
  lineNumber: number;
  width: number;
  height: number;
  /** Alpha bytes, base64. */
  data: string;
  widthU: number;
  heightU: number;
  topU: number;
};

export type PageKind = "template" | "notes";

export type StoredPage = {
  hash: string;
  name: string;
  savedAt: number;
  glyphs: StoredGlyph[];
  /** Missing on pages saved before notes existed. Those are template pages. */
  kind?: PageKind;
};

export type Library = {
  version: 1;
  pages: StoredPage[];
  /** Glyph ids the user turned off. */
  excluded: string[];
};

export const EMPTY_LIBRARY: Library = { version: 1, pages: [], excluded: [] };

export function encodeGlyph(g: ScannedGlyph): StoredGlyph {
  return {
    id: g.id,
    char: g.char,
    variant: g.variant,
    lineNumber: g.lineNumber,
    width: g.mask.width,
    height: g.mask.height,
    data: bytesToBase64(g.mask.data),
    widthU: g.metrics.widthU,
    heightU: g.metrics.heightU,
    topU: g.metrics.topU,
  };
}

export function decodeGlyph(s: StoredGlyph): ScannedGlyph {
  return {
    id: s.id,
    char: s.char,
    variant: s.variant,
    lineNumber: s.lineNumber,
    mask: { width: s.width, height: s.height, data: base64ToBytes(s.data) },
    metrics: { widthU: s.widthU, heightU: s.heightU, topU: s.topU },
  };
}

export function upsertPage(lib: Library, page: StoredPage): Library {
  return { ...lib, pages: [...lib.pages.filter((p) => p.hash !== page.hash), page] };
}

export function loadLibrary(): Library {
  if (typeof localStorage === "undefined") return EMPTY_LIBRARY;
  try {
    const parsed = JSON.parse(localStorage.getItem(LIBRARY_KEY) ?? "") as Partial<Library>;
    if (parsed.version !== 1 || !Array.isArray(parsed.pages)) return EMPTY_LIBRARY;
    return { version: 1, pages: parsed.pages, excluded: Array.isArray(parsed.excluded) ? parsed.excluded : [] };
  } catch {
    return EMPTY_LIBRARY;
  }
}

/** Returns false when the browser refuses to store more. */
export function saveLibrary(lib: Library): boolean {
  if (typeof localStorage === "undefined") return false;
  try {
    localStorage.setItem(LIBRARY_KEY, JSON.stringify(lib));
    return true;
  } catch {
    return false;
  }
}

export async function hashBlob(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}

function bytesToBase64(data: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < data.length; i += 0x8000) {
    bin += String.fromCharCode(...data.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

function base64ToBytes(data: string): Uint8Array {
  const bin = atob(data);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
