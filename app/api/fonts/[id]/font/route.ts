import { currentUser } from "@/lib/auth/session";
import { fontSamples } from "@/lib/db/fonts";
import { fontFileResponse } from "@/lib/font/file";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Log in first." }, { status: 401 });
  const { id } = await params;
  const found = fontSamples(user.id, id);
  if (!found) return Response.json({ error: "Font not found." }, { status: 404 });
  const download = new URL(request.url).searchParams.get("download") === "1";
  return fontFileResponse(found.name, found.glyphs, download);
}
