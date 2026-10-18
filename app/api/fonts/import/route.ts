import { currentUser } from "@/lib/auth/session";
import { createFont, savePage } from "@/lib/db/fonts";
import type { Library, StoredPage } from "@/lib/store/library";

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Log in first." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { name?: unknown; library?: Library } | null;
  const pages = body?.library?.pages;
  if (!Array.isArray(pages) || pages.length === 0) {
    return Response.json({ error: "Nothing saved in this browser to import." }, { status: 400 });
  }
  const name = typeof body?.name === "string" && body.name.trim() ? body.name : "Imported handwriting";
  const font = createFont(user.id, name);
  if ("error" in font) return Response.json(font, { status: 400 });
  for (const page of pages) {
    if (!page || typeof page.hash !== "string" || !Array.isArray(page.glyphs)) continue;
    const saved = savePage(user.id, font.id, page as StoredPage);
    if ("error" in saved && saved.error === "Font not found.") return Response.json(saved, { status: 404 });
  }
  return Response.json({ font }, { status: 201 });
}
