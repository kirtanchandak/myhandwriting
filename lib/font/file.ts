import { repairFont } from "@/lib/repair";
import type { ScannedGlyph } from "@/lib/scan/scanPage";
import { decodeGlyph, type StoredGlyph } from "@/lib/store/library";
import { buildHandFont, postScriptName, type FontSample } from "./build";

/** Repairs the samples, then traces the most typical one of each character into a font. */
export function samplesToFont(name: string, glyphs: readonly StoredGlyph[]): ArrayBuffer {
  const font = repairFont(glyphs.map(decodeGlyph));
  const source = new Map<FontSample, ScannedGlyph>();
  for (const list of font.bank.values()) {
    const glyph = list[0];
    source.set(
      {
        char: glyph.char,
        width: glyph.mask.width,
        height: glyph.mask.height,
        data: glyph.mask.data,
        widthU: glyph.metrics.widthU,
        heightU: glyph.metrics.heightU,
        topU: glyph.metrics.topU,
        sideU: glyph.metrics.sideU,
      },
      glyph,
    );
  }
  return buildHandFont(name, [...source.keys()], {
    wordSpacing: font.layout.wordSpacing,
    kern: (a, b) => font.layout.kern(source.get(a)!, source.get(b)!),
  });
}

export function fontFileResponse(name: string, glyphs: readonly StoredGlyph[], download: boolean): Response {
  if (glyphs.length === 0) return Response.json({ error: "This font has no letters yet." }, { status: 404 });
  const filename = `${postScriptName(name).replace(/-Regular$/, "")}.ttf`;
  return new Response(samplesToFont(name, glyphs), {
    headers: {
      "Content-Type": "font/ttf",
      "Cache-Control": "public, max-age=60",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename}"`,
    },
  });
}
