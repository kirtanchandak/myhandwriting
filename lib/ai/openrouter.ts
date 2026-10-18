import { parseNoteReading, type PlacedChar } from "./notes";
import { parseReading } from "./reading";

export const DEFAULT_MODEL = "google/gemini-4-argon";

function prompt(repeats: number): string {
  return `This image is one horizontal line of handwritten characters, written separately from left to right.
They are letters (upper or lower case), digits, or punctuation. Each character is usually written ${repeats} times in a row.
Read every character, including repeats. Return only JSON like {"chars":["A","A","A","B"]}.
One string per character. No spaces, words, or explanation.`;
}

const NOTE_PROMPT = `This image is one line of ordinary handwriting, words written left to right.
Return only JSON like {"chars":[{"c":"H","x":0.12},{"c":"i","x":0.18}]}.
c is one character: a letter, digit, or punctuation mark. x is the horizontal center of that character as a fraction of the image width, from 0 to 1.
Skip spaces. Include every character. No words or explanation.`;

/** Server-only: the key must never reach the browser. */
export async function readLine(
  pngBase64: string,
  apiKey: string,
  model = DEFAULT_MODEL,
  repeats = 3,
): Promise<string[]> {
  return parseReading(await complete(pngBase64, apiKey, model, prompt(repeats)));
}

/** Server-only. Reads a line of normal writing and where each character sits. */
export async function readNoteLine(pngBase64: string, apiKey: string, model = DEFAULT_MODEL): Promise<PlacedChar[]> {
  return parseNoteReading(await complete(pngBase64, apiKey, model, NOTE_PROMPT));
}

async function complete(pngBase64: string, apiKey: string, model: string, text: string): Promise<string> {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.SITE_URL || "https://myhandwriting.local",
      "X-Title": "myhandwriting",
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      reasoning: { effort: "minimal", exclude: true },
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text },
            { type: "image_url", image_url: { url: `data:image/png;base64,${pngBase64}` } },
          ],
        },
      ],
    }),
  });
  const body = (await response.json().catch(() => null)) as {
    error?: { message?: string };
    choices?: Array<{ message?: { content?: unknown } }>;
  } | null;
  if (!response.ok) {
    throw new Error(body?.error?.message || `OpenRouter returned ${response.status}.`);
  }
  return messageText(body?.choices?.[0]?.message?.content);
}

function messageText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((part) => (part && typeof part === "object" && "text" in part ? String(part.text ?? "") : "")).join("");
  }
  return "";
}
