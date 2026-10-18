import { currentUser } from "@/lib/auth/session";
import { setPublished } from "@/lib/db/fonts";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Log in first." }, { status: 401 });
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { published?: unknown } | null;
  const result = setPublished(user.id, id, body?.published === true);
  if ("error" in result) return Response.json(result, { status: result.error === "Font not found." ? 404 : 400 });
  return Response.json(result);
}
