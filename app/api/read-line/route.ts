import { DEFAULT_MODEL, readLine, readNoteLine } from "@/lib/ai/openrouter";

const MAX_IMAGE_CHARS = 2_000_000;

function apiKey() {
  return process.env.OPENROUTER_API_KEY?.trim() || null;
}

export function GET() {
  return Response.json({ enabled: apiKey() !== null });
}

export async function POST(request: Request) {
  const key = apiKey();
  if (!key) return Response.json({ error: "AI reading is not set up on this server." }, { status: 503 });

  const body = (await request.json().catch(() => null)) as { image?: unknown; repeats?: unknown; mode?: unknown } | null;
  const image = body?.image;
  if (typeof image !== "string" || !image || image.length > MAX_IMAGE_CHARS || !/^[A-Za-z0-9+/]+=*$/.test(image)) {
    return Response.json({ error: "Send one PNG line image as base64." }, { status: 400 });
  }
  const repeats = typeof body?.repeats === "number" && body.repeats >= 1 && body.repeats <= 9 ? body.repeats : 3;

  const model = process.env.OPENROUTER_MODEL?.trim() || DEFAULT_MODEL;
  try {
    if (body?.mode === "notes") {
      const placed = await readNoteLine(image, key, model);
      return Response.json({ placed });
    }
    const chars = await readLine(image, key, model, repeats);
    return Response.json({ chars });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "The AI could not read this line." }, { status: 502 });
  }
}
