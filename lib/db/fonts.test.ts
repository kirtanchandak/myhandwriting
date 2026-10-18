import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAccount } from "./accounts";
import { closeDb } from "./index";
import { createFont, libraryFor, savePage } from "./fonts";
import type { StoredGlyph } from "@/lib/store/library";

function glyph(id: string, char: string): StoredGlyph {
  return {
    id,
    char,
    variant: 0,
    lineNumber: 1,
    width: 1,
    height: 1,
    data: Buffer.from([9]).toString("base64"),
    widthU: 0.2,
    heightU: 0.4,
    topU: -0.3,
  };
}

describe("font pages", () => {
  beforeEach(() => {
    closeDb();
    process.env.DATABASE_PATH = path.join(mkdtempSync(path.join(tmpdir(), "mh-")), "test.sqlite");
  });
  afterEach(() => closeDb());

  it("keeps a new character and drops one the font already has", () => {
    const account = createAccount("ada", "longenough");
    if ("error" in account) throw new Error(account.error);
    const font = createFont(account.id, "Ada's font");
    if ("error" in font) throw new Error(font.error);

    const first = savePage(account.id, font.id, {
      hash: "page-a",
      name: "a.jpg",
      kind: "template",
      savedAt: 1,
      glyphs: [glyph("page-a:1", "A"), glyph("page-a:2", "B")],
    });
    if ("error" in first) throw new Error(first.error);
    expect(first.glyphs.map((g) => g.char)).toEqual(["A", "B"]);

    const second = savePage(account.id, font.id, {
      hash: "page-b",
      name: "b.jpg",
      kind: "notes",
      savedAt: 2,
      glyphs: [glyph("page-b:1", "A"), glyph("page-b:2", "C")],
    });
    if ("error" in second) throw new Error(second.error);
    expect(second.glyphs.map((g) => g.char)).toEqual(["C"]);

    const loaded = libraryFor(account.id, font.id);
    expect(loaded?.library.pages).toHaveLength(2);
    expect(loaded?.library.pages.flatMap((p) => p.glyphs.map((g) => g.char)).sort()).toEqual(["A", "B", "C"]);
    expect(savePage("someone-else", font.id, first)).toEqual({ error: "Font not found." });
  });

  it("stops a sixth notes page", () => {
    const account = createAccount("bea", "longenough");
    if ("error" in account) throw new Error(account.error);
    const font = createFont(account.id, "Notes");
    if ("error" in font) throw new Error(font.error);
    for (let i = 0; i < 5; i++) {
      const saved = savePage(account.id, font.id, {
        hash: `n${i}`,
        name: `${i}.jpg`,
        kind: "notes",
        savedAt: i,
        glyphs: [glyph(`n${i}:1`, String.fromCharCode(68 + i))],
      });
      expect("error" in saved).toBe(false);
    }
    const extra = savePage(account.id, font.id, {
      hash: "n6",
      name: "6.jpg",
      kind: "notes",
      savedAt: 6,
      glyphs: [glyph("n6:1", "Z")],
    });
    expect(extra).toMatchObject({ error: /5 pages/ });
  });
});
