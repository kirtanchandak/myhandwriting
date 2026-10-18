import { describe, expect, it } from "vitest";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { readFileSync } from "node:fs";
import { buildGuide } from "@/lib/template/guide";
import { buildBank, missingChars } from "@/lib/bank/bank";
import { rgbaToGray } from "./image";
import { alignBands, looksLikeTemplate, scanPage, type PageScan } from "./scanPage";

async function loadGray(path: string) {
  const img = await loadImage(readFileSync(path));
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);
  const { data } = ctx.getImageData(0, 0, img.width, img.height);
  return rgbaToGray(data, img.width, img.height);
}

function page(rows: number, ok: number): Pick<PageScan, "rows" | "lines"> {
  return {
    rows: Array.from({ length: rows }, () => ({}) as PageScan["rows"][number]),
    lines: Array.from({ length: ok }, () => ({ ok: true }) as PageScan["lines"][number]),
  };
}

describe("looksLikeTemplate", () => {
  it("treats a page as the template when most rows match the guide", () => {
    expect(looksLikeTemplate(page(4, 3))).toBe(true);
    expect(looksLikeTemplate(page(1, 1))).toBe(true);
    expect(looksLikeTemplate(page(0, 0))).toBe(true);
  });

  it("treats a page of ordinary writing as notes", () => {
    expect(looksLikeTemplate(page(4, 1))).toBe(false);
    expect(looksLikeTemplate(page(3, 0))).toBe(false);
  });
});

describe("alignBands", () => {
  it("matches rows one to one when counts agree", () => {
    expect(alignBands([9, 9, 6], [9, 9, 6, 9])).toEqual([
      [0, 0],
      [1, 1],
      [2, 2],
    ]);
  });

  it("skips a stray row of writing", () => {
    expect(alignBands([2, 9, 9, 6], [9, 9, 6])).toEqual([
      [1, 0],
      [2, 1],
      [3, 2],
    ]);
  });

  it("still assigns a row with too few characters so it can be flagged", () => {
    expect(alignBands([9, 7, 9], [9, 9, 9])).toEqual([
      [0, 0],
      [1, 1],
      [2, 2],
    ]);
  });
});

describe("scanPage on synthetic notebook photos", () => {
  const guide = buildGuide();

  it("reads both sample pages with zero flagged lines and fills the whole charset", async () => {
    const page1 = scanPage(await loadGray("public/samples/page-1.jpg"), guide, 1, "p1");
    expect(page1.ok).toBe(true);
    expect(Math.abs(page1.skewDeg - 1.6)).toBeLessThan(0.3);
    expect(page1.lines.map((l) => l.lineNumber)).toEqual(Array.from({ length: 15 }, (_, i) => i + 1));
    expect(page1.lines.filter((l) => !l.ok).map((l) => l.message)).toEqual([]);

    const next = page1.lines.at(-1)!.lineNumber + 1;
    const page2 = scanPage(await loadGray("public/samples/page-2.jpg"), guide, next, "p2");
    expect(page2.ok).toBe(true);
    expect(page2.lines.map((l) => l.lineNumber)).toEqual(Array.from({ length: 14 }, (_, i) => i + 16));
    expect(page2.lines.filter((l) => !l.ok).map((l) => l.message)).toEqual([]);

    const bank = buildBank([page1.lines, page2.lines]);
    expect(missingChars(bank, guide.charset)).toEqual([]);
    for (const samples of bank.values()) expect(samples).toHaveLength(3);
  });

  it("keeps descenders below and capitals above the baseline", async () => {
    const page1 = scanPage(await loadGray("public/samples/page-1.jpg"), guide, 1, "p1");
    const bank = buildBank([page1.lines]);
    const bottom = (c: string) => {
      const m = bank.get(c)![0].metrics;
      return m.topU + m.heightU;
    };
    const top = (c: string) => bank.get(c)![0].metrics.topU;
    expect(bottom("g")).toBeGreaterThan(0.15);
    expect(bottom("p")).toBeGreaterThan(0.15);
    expect(Math.abs(bottom("a"))).toBeLessThan(0.1);
    expect(Math.abs(bottom("A"))).toBeLessThan(0.1);
    expect(top("A")).toBeLessThan(top("a") - 0.1);
  });
});
