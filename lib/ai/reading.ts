/** Pulls the character list out of a model reply. Accepts a JSON object or a bare array. */
export function parseReading(text: string): string[] {
  const cleaned = text.replace(/```(?:json)?/gi, "");
  const objAt = cleaned.indexOf("{");
  const arrAt = cleaned.indexOf("[");
  let value: unknown;
  try {
    if (objAt >= 0 && (arrAt < 0 || objAt < arrAt)) {
      const parsed = JSON.parse(cleaned.slice(objAt, cleaned.lastIndexOf("}") + 1)) as { chars?: unknown; characters?: unknown };
      value = parsed.chars ?? parsed.characters;
    } else if (arrAt >= 0) {
      value = JSON.parse(cleaned.slice(arrAt, cleaned.lastIndexOf("]") + 1));
    }
  } catch {
    throw new Error("The model did not return a character list.");
  }
  if (value === undefined) throw new Error("The model did not return a character list.");
  if (!Array.isArray(value) || value.some((c) => typeof c !== "string" || [...c].length !== 1)) {
    throw new Error("The model did not return one entry per character.");
  }
  return value as string[];
}

export function readingsMatch(got: readonly string[], expected: readonly string[]): boolean {
  return got.length === expected.length && got.every((c, i) => c === expected[i]);
}

export function readingText(chars: readonly string[]): string {
  return chars.join(" ");
}
