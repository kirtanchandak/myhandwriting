import { currentUser } from "@/lib/auth/session";
import { savePage } from "@/lib/db/fonts";
import type { StoredPage } from "@/lib/store/library";

type Params = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: Params) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Log in first." }, { status: 401 });
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as StoredPage | null;
  if (!body || typeof body.hash !== "string" || !Array.isArray(body.glyphs)) {
    return Response.json({ error: "Send the processed page." }, { status: 400 });
  }
  const page = savePage(user.id, id, body);
  if ("error" in page) return Response.json(page, { status: page.error === "Font not found." ? 404 : 400 });
  return Response.json({ page });
}
