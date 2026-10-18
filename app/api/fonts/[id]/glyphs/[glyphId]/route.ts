import { currentUser } from "@/lib/auth/session";
import { deleteGlyph, setGlyphExcluded } from "@/lib/db/fonts";

type Params = { params: Promise<{ id: string; glyphId: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Log in first." }, { status: 401 });
  const { id, glyphId } = await params;
  const body = (await request.json().catch(() => null)) as { excluded?: unknown } | null;
  if (typeof body?.excluded !== "boolean") return Response.json({ error: "Say whether the sample is left out." }, { status: 400 });
  if (!setGlyphExcluded(user.id, id, decodeURIComponent(glyphId), body.excluded)) {
    return Response.json({ error: "Sample not found." }, { status: 404 });
  }
  return Response.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: Params) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Log in first." }, { status: 401 });
  const { id, glyphId } = await params;
  if (!deleteGlyph(user.id, id, decodeURIComponent(glyphId))) {
    return Response.json({ error: "Sample not found." }, { status: 404 });
  }
  return Response.json({ ok: true });
}
