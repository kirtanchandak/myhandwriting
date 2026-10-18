import { currentUser } from "@/lib/auth/session";
import { deleteFont, libraryFor, renameFont } from "@/lib/db/fonts";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Log in first." }, { status: 401 });
  const { id } = await params;
  const found = libraryFor(user.id, id);
  if (!found) return Response.json({ error: "Font not found." }, { status: 404 });
  return Response.json(found);
}

export async function PATCH(request: Request, { params }: Params) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Log in first." }, { status: 401 });
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { name?: unknown } | null;
  if (typeof body?.name !== "string") return Response.json({ error: "Give the font a name." }, { status: 400 });
  const error = renameFont(user.id, id, body.name);
  if (error) return Response.json(error, { status: error.error === "Font not found." ? 404 : 400 });
  return Response.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: Params) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Log in first." }, { status: 401 });
  const { id } = await params;
  if (!deleteFont(user.id, id)) return Response.json({ error: "Font not found." }, { status: 404 });
  return Response.json({ ok: true });
}
