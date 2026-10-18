import { publicHand } from "@/lib/db/fonts";
import { fontFileResponse } from "@/lib/font/file";

type Params = { params: Promise<{ slug: string }> };

export async function GET(request: Request, { params }: Params) {
  const { slug } = await params;
  const hand = publicHand(slug);
  if (!hand) return Response.json({ error: "This page is not published." }, { status: 404 });
  const download = new URL(request.url).searchParams.get("download") === "1";
  return fontFileResponse(hand.name, hand.glyphs, download);
}
