import { Font, Glyph, Path } from "opentype.js";
import { traceContours } from "./trace";

/** One rule-spacing of the notebook becomes this many font units. */
const UNIT = 1000;
const SIDE = 40;

export type FontSample = {
  char: string;
  width: number;
  height: number;
  data: Uint8Array;
  widthU: number;
  heightU: number;
  topU: number;
};

export function postScriptName(family: string): string {
  const cleaned = family.replace(/[^A-Za-z0-9]/g, "") || "Hand";
  return `${cleaned}-Regular`.slice(0, 63);
}

/** One outline per character, plus a space. The first sample of a character is the one that ships. */
export function buildHandFont(familyName: string, samples: readonly FontSample[]): ArrayBuffer {
  const family = familyName.trim().slice(0, 60) || "Hand";
  const glyphs: Glyph[] = [
    new Glyph({ name: ".notdef", advanceWidth: 500, path: new Path() }),
    new Glyph({ name: "space", unicode: 32, advanceWidth: Math.round(UNIT * 0.32), path: new Path() }),
  ];
  const seen = new Set<string>();
  for (const sample of samples) {
    if (seen.has(sample.char) || [...sample.char].length !== 1) continue;
    const code = sample.char.codePointAt(0);
    if (code === undefined || code < 32 || code === 32) continue;
    const path = outline(sample);
    if (!path.commands.length) continue;
    seen.add(sample.char);
    glyphs.push(
      new Glyph({
        name: glyphName(sample.char, code),
        unicode: code,
        advanceWidth: Math.round(sample.widthU * UNIT + SIDE * 2),
        path,
      }),
    );
  }
  const font = new Font({
    familyName: family,
    styleName: "Regular",
    fullName: `${family} Regular`,
    postScriptName: postScriptName(family),
    version: "Version 1.0",
    description: `Handwriting traced from ${family}.`,
    unitsPerEm: UNIT,
    ascender: 1200,
    descender: -500,
    glyphs,
  });
  return font.toArrayBuffer();
}

function glyphName(char: string, code: number): string {
  if (/^[A-Za-z0-9]$/.test(char)) return char;
  return `uni${code.toString(16).toUpperCase().padStart(4, "0")}`;
}

function outline(sample: FontSample): Path {
  const path = new Path();
  for (const ring of traceContours(sample.data, sample.width, sample.height)) {
    const points = ring.map(([x, y]) => toFont(sample, x, y));
    // The trace walks clockwise with y downward. Flipping y makes that counter-clockwise,
    // and a TrueType outline wants the ink on the right, so the ring is reversed.
    points.reverse();
    path.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) path.lineTo(points[i][0], points[i][1]);
    path.close();
  }
  return path;
}

function toFont(sample: FontSample, x: number, y: number): [number, number] {
  const fx = SIDE + (x / sample.width) * sample.widthU * UNIT;
  const fy = -((sample.topU + (y / sample.height) * sample.heightU) * UNIT);
  return [Math.round(fx), Math.round(fy)];
}
