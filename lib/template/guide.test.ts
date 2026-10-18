import { describe, expect, it } from "vitest";
import {
  CHARSET,
  GROUPS,
  GUIDE_VERSION,
  RULED_LINES_PER_PAGE,
  TARGET_GLYPHS_PER_LINE,
  buildGuide,
  estimatedPages,
  guideFromJson,
  guideToJson,
  lineText,
} from "./guide";

describe("charset", () => {
  it("has the 81 unique characters from HANDOFF 4.1", () => {
    expect(CHARSET).toHaveLength(81);
    expect(new Set(CHARSET).size).toBe(81);
    expect(CHARSET.join("")).toContain(".,;:!?'\"-()/&@#%+=_");
  });
});

describe("buildGuide defaults", () => {
  const guide = buildGuide();
  const glyphs = guide.lines.flatMap((l) => l.glyphs);

  it("uses 3 samples and 3 characters per line", () => {
    expect(guide).toMatchObject({ version: GUIDE_VERSION, variants: 3, charsPerLine: 3, skipRuledLine: true });
  });

  it("splits groups into 9 + 9 + 4 + 7 = 29 lines, never mixing groups on a line", () => {
    const perGroup = GROUPS.map((g) => guide.lines.filter((l) => l.group === g.id).length);
    expect(perGroup).toEqual([9, 9, 4, 7]);
    expect(guide.lines).toHaveLength(29);
    for (const line of guide.lines) {
      const group = GROUPS.find((g) => g.id === line.group)!;
      for (const c of line.chars) expect(group.chars).toContain(c);
    }
  });

  it("numbers lines from 1 in order", () => {
    guide.lines.forEach((l, i) => expect(l.number).toBe(i + 1));
  });

  it("lists every (char, variant) exactly once, in charset order, with running indexes", () => {
    expect(glyphs).toHaveLength(CHARSET.length * 3);
    CHARSET.forEach((ch, i) => {
      for (let v = 0; v < 3; v++) expect(glyphs[i * 3 + v]).toMatchObject({ char: ch, variant: v });
    });
    glyphs.forEach((g, i) => expect(g.index).toBe(i));
  });

  it("keeps each line's glyphs consistent with its chars", () => {
    for (const line of guide.lines) {
      expect(line.glyphs.map((g) => g.char)).toEqual(line.chars.flatMap((c) => [c, c, c]));
    }
  });
});

describe("options", () => {
  it.each([
    [{ variants: 1 }, 3 + 3 + 2 + 3, 81],
    [{ variants: 4 }, 13 + 13 + 5 + 10, 324],
    [{ variants: 5 }, 81, 405],
    [{ charsPerLine: 2 }, 13 + 13 + 5 + 10, 243],
    [{ charsPerLine: 6, variants: 2 }, 5 + 5 + 2 + 4, 162],
  ])("%o -> %i lines, %i glyphs", (opts, lineCount, glyphCount) => {
    const guide = buildGuide(opts);
    expect(guide.lines).toHaveLength(lineCount);
    expect(guide.lines.flatMap((l) => l.glyphs)).toHaveLength(glyphCount);
  });

  it("keeps lines at or under the target length unless one char already exceeds it", () => {
    for (let variants = 1; variants <= 5; variants++) {
      for (const line of buildGuide({ variants }).lines) {
        expect(line.glyphs.length).toBeLessThanOrEqual(TARGET_GLYPHS_PER_LINE);
      }
    }
  });

  it("estimates notebook pages including the empty lines", () => {
    expect(estimatedPages(buildGuide())).toBe(Math.ceil((29 * 2) / RULED_LINES_PER_PAGE));
    expect(estimatedPages(buildGuide({ variants: 1 }))).toBe(1);
  });

  it("rejects out-of-range options", () => {
    expect(() => buildGuide({ variants: 0 })).toThrow(RangeError);
    expect(() => buildGuide({ variants: 6 })).toThrow(RangeError);
    expect(() => buildGuide({ variants: 2.5 })).toThrow(RangeError);
    expect(() => buildGuide({ charsPerLine: 10 })).toThrow(RangeError);
  });
});

describe("lineText", () => {
  it("repeats each char with single spaces and separates chars with wider gaps", () => {
    const guide = buildGuide();
    expect(lineText(guide.lines[0], 3)).toBe("A A A   B B B   C C C");
    expect(lineText(guide.lines[8], 3)).toBe("Y Y Y   Z Z Z");
    expect(lineText(guide.lines.at(-1)!, 3)).toBe("_ _ _");
  });
});

describe("json", () => {
  it("round-trips the guide", () => {
    const guide = buildGuide({ variants: 2 });
    expect(guideFromJson(guideToJson(guide))).toEqual(guide);
  });

  it("rejects other guide versions", () => {
    expect(() => guideFromJson(JSON.stringify({ ...buildGuide(), version: 99 }))).toThrow(/version/);
  });
});
