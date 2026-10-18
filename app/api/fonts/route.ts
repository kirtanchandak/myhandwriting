import { currentUser } from "@/lib/auth/session";
import { createFont, listFonts } from "@/lib/db/fonts";

export async function GET() {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Log in first." }, { status: 401 });
  return Response.json({ fonts: listFonts(user.id) });
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Log in first." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { name?: unknown } | null;
  if (typeof body?.name !== "string") return Response.json({ error: "Give the font a name." }, { status: 400 });
  const font = createFont(user.id, body.name);
  if ("error" in font) return Response.json(font, { status: 400 });
  return Response.json({ font }, { status: 201 });
}
