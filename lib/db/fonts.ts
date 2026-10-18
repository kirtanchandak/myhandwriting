import { randomUUID } from "node:crypto";
import { checkFontName } from "@/lib/auth/password";
import type { Library, PageKind, StoredGlyph, StoredPage } from "@/lib/store/library";
import { glyphsToTopUp } from "@/lib/bank/bank";
import { cleanGlyphs } from "@/lib/scan/tidy";
import { decodeGlyph } from "@/lib/store/library";
import { getDb } from "./index";

const NOTES_LIMIT = 5;

export type FontSummary = {
  id: string;
  name: string;
  createdAt: number;
  samples: number;
  ready: number;
};

type FontOwner = { id: string; user_id: string; name: string; created_at: number };

function owned(userId: string, fontId: string): FontOwner | undefined {
  return getDb().prepare("SELECT id, user_id, name, created_at FROM fonts WHERE id = ? AND user_id = ?").get(fontId, userId) as
    | FontOwner
    | undefined;
}

export function listFonts(userId: string): FontSummary[] {
  return getDb()
    .prepare(
      `SELECT fonts.id, fonts.name, fonts.created_at AS createdAt,
              (SELECT COUNT(*) FROM glyphs WHERE glyphs.font_id = fonts.id AND glyphs.excluded = 0) AS samples,
              (SELECT COUNT(DISTINCT ch) FROM glyphs WHERE glyphs.font_id = fonts.id AND glyphs.excluded = 0) AS ready
       FROM fonts WHERE user_id = ? ORDER BY created_at DESC`,
    )
    .all(userId) as FontSummary[];
}

export function createFont(userId: string, name: string): { id: string; name: string } | { error: string } {
  const nameError = checkFontName(name);
  if (nameError) return { error: nameError };
  const font = { id: randomUUID(), name: name.trim() };
  getDb().prepare("INSERT INTO fonts (id, user_id, name, created_at) VALUES (?, ?, ?, ?)").run(font.id, userId, font.name, Date.now());
  return font;
}

export function renameFont(userId: string, fontId: string, name: string): { error: string } | null {
  if (!owned(userId, fontId)) return { error: "Font not found." };
  const nameError = checkFontName(name);
  if (nameError) return { error: nameError };
  getDb().prepare("UPDATE fonts SET name = ? WHERE id = ?").run(name.trim(), fontId);
  return null;
}

export function deleteFont(userId: string, fontId: string): boolean {
  if (!owned(userId, fontId)) return false;
  getDb().prepare("DELETE FROM fonts WHERE id = ?").run(fontId);
  return true;
}

export function libraryFor(userId: string, fontId: string): { name: string; library: Library } | null {
  const font = owned(userId, fontId);
  if (!font) return null;
  const pages = getDb()
    .prepare("SELECT id, hash, name, kind, saved_at FROM pages WHERE font_id = ? ORDER BY saved_at")
    .all(fontId) as Array<{ id: string; hash: string; name: string; kind: PageKind; saved_at: number }>;
  const glyphRows = getDb()
    .prepare(
      `SELECT id, page_id, ch, variant, line_number, width, height, data, width_u, height_u, top_u, excluded
       FROM glyphs WHERE font_id = ?`,
    )
    .all(fontId) as Array<{
    id: string;
    page_id: string;
    ch: string;
    variant: number;
    line_number: number;
    width: number;
    height: number;
    data: Buffer;
    width_u: number;
    height_u: number;
    top_u: number;
    excluded: number;
  }>;
  const excluded: string[] = [];
  const byPage = new Map<string, StoredGlyph[]>();
  for (const row of glyphRows) {
    const list = byPage.get(row.page_id) ?? [];
    list.push({
      id: row.id,
      char: row.ch,
      variant: row.variant,
      lineNumber: row.line_number,
      width: row.width,
      height: row.height,
      data: Buffer.from(row.data).toString("base64"),
      widthU: row.width_u,
      heightU: row.height_u,
      topU: row.top_u,
    });
    byPage.set(row.page_id, list);
    if (row.excluded) excluded.push(row.id);
  }
  return {
    name: font.name,
    library: {
      version: 1,
      excluded,
      pages: pages.map((page) => ({
        hash: page.hash,
        name: page.name,
        kind: page.kind,
        savedAt: page.saved_at,
        glyphs: byPage.get(page.id) ?? [],
      })),
    },
  };
}

/**
 * Stores one processed page. Each character is topped up to three samples
 * across the font's other pages. Replaces a previous save of the same photo.
 */
export function savePage(userId: string, fontId: string, page: StoredPage): StoredPage | { error: string } {
  if (!owned(userId, fontId)) return { error: "Font not found." };
  const kind: PageKind = page.kind === "notes" ? "notes" : "template";
  const db = getDb();
  const existing = db.prepare("SELECT id FROM pages WHERE font_id = ? AND hash = ?").get(fontId, page.hash) as
    | { id: string }
    | undefined;
  if (kind === "notes" && !existing) {
    const notes = db.prepare("SELECT COUNT(*) AS n FROM pages WHERE font_id = ? AND kind = 'notes'").get(fontId) as {
      n: number;
    };
    if (notes.n >= NOTES_LIMIT) return { error: `Notes are limited to ${NOTES_LIMIT} pages.` };
  }
  const countRows = db
    .prepare(
      `SELECT glyphs.ch AS ch, COUNT(*) AS n FROM glyphs
       JOIN pages ON pages.id = glyphs.page_id
       WHERE glyphs.font_id = ? AND pages.hash != ?
       GROUP BY glyphs.ch`,
    )
    .all(fontId, page.hash) as Array<{ ch: string; n: number }>;
  const kept = glyphsToTopUp(
    new Map(countRows.map((row) => [row.ch, row.n])),
    cleanGlyphs(page.glyphs.map(decodeGlyph)),
  );
  const stored: StoredPage = {
    hash: page.hash,
    name: page.name.slice(0, 200) || "Page",
    kind,
    savedAt: Date.now(),
    glyphs: kept.map((glyph) => ({
      id: glyph.id,
      char: glyph.char,
      variant: glyph.variant,
      lineNumber: glyph.lineNumber,
      width: glyph.mask.width,
      height: glyph.mask.height,
      data: Buffer.from(glyph.mask.data).toString("base64"),
      widthU: glyph.metrics.widthU,
      heightU: glyph.metrics.heightU,
      topU: glyph.metrics.topU,
    })),
  };

  const write = db.transaction(() => {
    const pageId = existing?.id ?? randomUUID();
    if (existing) {
      db.prepare("DELETE FROM glyphs WHERE font_id = ? AND page_id = ?").run(fontId, pageId);
      db.prepare("UPDATE pages SET name = ?, kind = ?, saved_at = ? WHERE id = ?").run(stored.name, kind, stored.savedAt, pageId);
    } else {
      db.prepare("INSERT INTO pages (id, font_id, hash, name, kind, saved_at) VALUES (?, ?, ?, ?, ?, ?)").run(
        pageId,
        fontId,
        stored.hash,
        stored.name,
        kind,
        stored.savedAt,
      );
    }
    const insert = db.prepare(
      `INSERT INTO glyphs (font_id, id, page_id, ch, variant, line_number, width, height, data, width_u, height_u, top_u, excluded)
       VALUES (@fontId, @id, @pageId, @ch, @variant, @lineNumber, @width, @height, @data, @widthU, @heightU, @topU, 0)`,
    );
    for (const glyph of stored.glyphs) {
      insert.run({
        fontId,
        id: glyph.id,
        pageId,
        ch: glyph.char,
        variant: glyph.variant,
        lineNumber: glyph.lineNumber,
        width: glyph.width,
        height: glyph.height,
        data: Buffer.from(glyph.data, "base64"),
        widthU: glyph.widthU,
        heightU: glyph.heightU,
        topU: glyph.topU,
      });
    }
  });
  write();
  return stored;
}

export function setGlyphExcluded(userId: string, fontId: string, glyphId: string, excluded: boolean): boolean {
  if (!owned(userId, fontId)) return false;
  const result = getDb()
    .prepare("UPDATE glyphs SET excluded = ? WHERE font_id = ? AND id = ?")
    .run(excluded ? 1 : 0, fontId, glyphId);
  return result.changes > 0;
}

export function deleteGlyph(userId: string, fontId: string, glyphId: string): boolean {
  if (!owned(userId, fontId)) return false;
  const result = getDb().prepare("DELETE FROM glyphs WHERE font_id = ? AND id = ?").run(fontId, glyphId);
  return result.changes > 0;
}
