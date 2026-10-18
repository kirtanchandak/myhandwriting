import { decodeGlyph, type StoredGlyph } from "@/lib/store/library";
import { buildHandFont, postScriptName, type FontSample } from "./build";
import { penGlyph } from "./pen";

/** Traces the first sample of each character into a TrueType font. */
export function samplesToFont(name: string, glyphs: readonly StoredGlyph[]): ArrayBuffer {
  const samples: FontSample[] = [];
  const seen = new Set<string>();
  for (const stored of glyphs) {
    if (seen.has(stored.char)) continue;
    seen.add(stored.char);
    const glyph = penGlyph(decodeGlyph(stored));
    samples.push({
      char: stored.char,
      width: glyph.mask.width,
      height: glyph.mask.height,
      data: glyph.mask.data,
      widthU: glyph.metrics.widthU,
      heightU: glyph.metrics.heightU,
      topU: glyph.metrics.topU,
    });
  }
  return buildHandFont(name, samples);
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
