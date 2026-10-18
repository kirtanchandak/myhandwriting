import { describe, expect, it } from "vitest";
import type { LineInk } from "@/lib/scan/scanPage";
import { buildGuide } from "@/lib/template/guide";
import { labelRow, matchGuideLine } from "./label";

const guide = buildGuide({ variants: 3 });
const charsOf = (n: number) => guide.lines[n - 1].glyphs.map((g) => g.char);

function rowOf(count: number): LineInk {
  const width = count * 30 + 10;
  const height = 36;
  const ink = new Uint8Array(width * height);
  for (let i = 0; i < count; i++) {
    for (let y = 8; y <= 28; y++) for (let x = 10 + i * 30; x <= 26 + i * 30; x++) ink[y * width + x] = 1;
  }
  return { width, height, ink, contrast: ink.map((v) => (v ? 80 : 0)), baselineY: 28, unit: 30, inkRef: 80 };
}

describe("matchGuideLine", () => {
  it("finds the exact line regardless of where it sits on the page", () => {
    expect(matchGuideLine(charsOf(12), guide)?.number).toBe(12);
  });

  it("corrects look-alike characters to the guide line", () => {
    const line = guide.lines.find((l) => l.glyphs.some((g) => g.char === "O"))!;
    const read = line.glyphs.map((g) => (g.char === "O" ? "0" : g.char));
    expect(matchGuideLine(read, guide)?.number).toBe(line.number);
  });

  it("uses the expected next line to settle upper versus lower case", () => {
    expect(matchGuideLine(charsOf(17), guide)?.number).toBe(17);
    expect(matchGuideLine(charsOf(17), guide, 8)?.number).toBe(8);
    expect(matchGuideLine(charsOf(12), guide, 8)?.number).toBe(12);
  });

  it("gives up when the reading fits no line", () => {
    expect(matchGuideLine(["x", "y", "z", "q", "w", "e", "r", "t", "u"], guide)).toBeNull();
  });
});

describe("labelRow", () => {
  it("labels glyphs from the matched guide line", () => {
    const read = charsOf(3);
    const label = labelRow(read, rowOf(read.length), guide, "p:r0");
    expect(label.lineNumber).toBe(3);
    expect(label.glyphs?.map((g) => g.char)).toEqual(read);
  });

  it("uses the reading itself when it matches no line", () => {
    const label = labelRow(["h", "i", "!"], rowOf(3), guide, "p:r1");
    expect(label.lineNumber).toBeNull();
    expect(label.glyphs?.map((g) => g.char)).toEqual(["h", "i", "!"]);
  });
});
