import { describe, expect, it } from "vitest";
import { removeRules } from "./rules";

describe("removeRules", () => {
  it("puts back ruled lines that a row of letters hid", () => {
    const w = 200;
    const h = 150;
    const mask = new Uint8Array(w * h);
    const contrast = new Uint8Array(w * h);
    for (const y of [10, 30, 50, 70, 130]) {
      for (let x = 0; x < w; x++) {
        mask[y * w + x] = 1;
        contrast[y * w + x] = 20;
      }
    }
    const { ruleYs } = removeRules(mask, contrast, w, h);
    expect(ruleYs.map((y) => Math.round(y))).toEqual([10, 30, 50, 70, 90, 110, 130]);
  });

  it("keeps a pen stroke that crosses a ruled line of the same darkness", () => {
    const w = 200;
    const h = 40;
    const mask = new Uint8Array(w * h);
    const contrast = new Uint8Array(w * h);
    const line = 20;
    for (let x = 0; x < w; x++) {
      mask[line * w + x] = 1;
      contrast[line * w + x] = 20;
    }
    for (let y = 16; y <= 24; y++) {
      mask[y * w + 100] = 1;
      contrast[y * w + 100] = 20;
    }
    const { ink } = removeRules(mask, contrast, w, h);
    expect(ink[line * w + 10]).toBe(0);
    expect(ink[16 * w + 100]).toBe(1);
    expect(ink[line * w + 100]).toBe(1);
    expect(ink[24 * w + 100]).toBe(1);
  });
});
