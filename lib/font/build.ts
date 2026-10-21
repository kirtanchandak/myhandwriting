import { Font, Glyph, Path } from "opentype.js";
import { addTable, kernTable, type KernPair } from "./kern";
import { traceContours } from "./trace";

/** One rule-spacing of the notebook becomes this many font units. */
const UNIT = 1000;
const SIDE = 40;
/** Kerning smaller than this, in font units, is not worth a pair. */
const MIN_KERN = 8;

export type FontSample = {
  char: string;
  width: number;
  height: number;
  data: Uint8Array;
  widthU: number;
  heightU: number;
  topU: number;
  /** Margin on each side of the ink, in rule units. */
  sideU?: number;
};

export type FontSpacing = {
  /** Width of a space, in rule units. */
  wordSpacing?: number;
  /** Extra space between two characters, in rule units. */
  kern?: (left: FontSample, right: FontSample) => number;
};

export function postScriptName(family: string): string {
  const cleaned = family.replace(/[^A-Za-z0-9]/g, "") || "Hand";
  return `${cleaned}-Regular`.slice(0, 63);
}

/** One outline per character, plus a space. The first sample of a character is the one that ships. */
export function buildHandFont(familyName: string, samples: readonly FontSample[], spacing: FontSpacing = {}): ArrayBuffer {
  const family = familyName.trim().slice(0, 60) || "Hand";
  const glyphs: Glyph[] = [
    new Glyph({ name: ".notdef", advanceWidth: 500, path: new Path() }),
    new Glyph({ name: "space", unicode: 32, advanceWidth: Math.round(UNIT * (spacing.wordSpacing ?? 0.32)), path: new Path() }),
  ];
  const shipped: Array<{ sample: FontSample; index: number }> = [];
  const seen = new Set<string>();
  for (const sample of samples) {
    if (seen.has(sample.char) || [...sample.char].length !== 1) continue;
    const code = sample.char.codePointAt(0);
    if (code === undefined || code < 32 || code === 32) continue;
    const path = outline(sample);
    if (!path.commands.length) continue;
    seen.add(sample.char);
    shipped.push({ sample, index: glyphs.length });
    glyphs.push(
      new Glyph({
        name: glyphName(sample.char, code),
        unicode: code,
        advanceWidth: Math.round(sample.widthU * UNIT + sideOf(sample) * 2),
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
  const file = font.toArrayBuffer();
  if (!spacing.kern) return file;
  const pairs: KernPair[] = [];
  for (const a of shipped) {
    for (const b of shipped) {
      const value = Math.round(spacing.kern(a.sample, b.sample) * UNIT);
      if (Math.abs(value) >= MIN_KERN) pairs.push({ left: a.index, right: b.index, value });
    }
  }
  return pairs.length ? addTable(file, "kern", kernTable(pairs)) : file;
}

function sideOf(sample: FontSample): number {
  return sample.sideU === undefined ? SIDE : sample.sideU * UNIT;
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
  const fx = sideOf(sample) + (x / sample.width) * sample.widthU * UNIT;
  const fy = -((sample.topU + (y / sample.height) * sample.heightU) * UNIT);
  return [Math.round(fx), Math.round(fy)];
}
