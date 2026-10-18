import type { GuideLine, WritingGuide } from "@/lib/template/guide";
import type { LineInk, ScannedGlyph } from "@/lib/scan/scanPage";
import { segmentLine, type Slot } from "./segment";

export type RowLabel = {
  /** Characters the row is labelled with, after matching to the guide. */
  chars: string[];
  /** Guide line the row matched, or null when the reading fits no line. */
  lineNumber: number | null;
  /** Null when the ink could not be cut into one piece per character. */
  glyphs: ScannedGlyph[] | null;
};

/**
 * The guide line a reading most likely is. Neighbouring guide lines share no
 * characters, so a reading within a third of a line's length can only be that
 * line; this corrects look-alikes such as O/0 or l/I. A row in the expected
 * position gets more slack.
 */
export function matchGuideLine(
  read: readonly string[],
  guide: WritingGuide,
  expected?: number,
): GuideLine | null {
  let best: GuideLine | null = null;
  let bestDist = Infinity;
  let tie = false;
  for (const line of guide.lines) {
    const d = editDistance(read, charsOf(line));
    if (d < bestDist) {
      best = line;
      bestDist = d;
      tie = false;
    } else if (d === bestDist) {
      tie = true;
    }
  }
  const hinted = expected ? guide.lines[expected - 1] : undefined;
  if (hinted) {
    const lower = read.map((c) => c.toLowerCase());
    const hintedDist = editDistance(lower, charsOf(hinted, true));
    const hintReach = Math.max(2.5, hinted.glyphs.length / 2);
    if (hintedDist <= hintReach && (!best || hintedDist <= editDistance(lower, charsOf(best, true)))) return hinted;
  }
  if (!best || tie) return null;
  return bestDist <= reach(best) ? best : null;
}

/**
 * Labels the rows of one page top to bottom. Each row is expected to be the
 * guide line after the previous one, which settles look-alike cases such as
 * VVV/vvv that the reading alone cannot.
 */
export function labelRows(
  reads: ReadonlyArray<readonly string[]>,
  crops: readonly LineInk[],
  guide: WritingGuide,
  idPrefix: string,
): RowLabel[] {
  let previous: { line: number; row: number } | null = null;
  return reads.map((read, i) => {
    const expected = previous ? previous.line + (i - previous.row) : undefined;
    const label = labelRow(read, crops[i], guide, `${idPrefix}:r${i}`, expected);
    if (label.lineNumber !== null) previous = { line: label.lineNumber, row: i };
    return label;
  });
}

const reach = (line: GuideLine) => Math.ceil(line.glyphs.length / 3);

/** Characters handwriting readers routinely confuse; swapping them costs less. */
const LOOKALIKES = ["0oO", "1lI|!i", "9gq", "5sS", "2zZ", "6b", ".,:;'`", "'\"`", "-_~", "(cC[", ")]"];
const lookalike = (a: string, b: string) => LOOKALIKES.some((g) => g.includes(a) && g.includes(b));

function charsOf(line: GuideLine, lower = false): string[] {
  return line.glyphs.map((g) => (lower ? g.char.toLowerCase() : g.char));
}

export function labelRow(
  read: readonly string[],
  crop: LineInk,
  guide: WritingGuide,
  id: string,
  expected?: number,
): RowLabel {
  const own = read.filter((c) => c.trim());
  const line = matchGuideLine(own, guide, expected);
  if (line) {
    const glyphs = segmentLine(crop, line.glyphs, line.number, id);
    if (glyphs) return { chars: line.glyphs.map((g) => g.char), lineNumber: line.number, glyphs };
  }
  if (own.length === 0) return { chars: own, lineNumber: line?.number ?? null, glyphs: null };
  return { chars: own, lineNumber: line?.number ?? null, glyphs: segmentLine(crop, slotsFor(own), 0, id) };
}

function slotsFor(chars: readonly string[]): Slot[] {
  const seen = new Map<string, number>();
  return chars.map((char) => {
    const variant = seen.get(char) ?? 0;
    seen.set(char, variant + 1);
    return { char, variant };
  });
}

function editDistance(a: readonly string[], b: readonly string[]): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      const swap = a[i - 1] === b[j - 1] ? 0 : lookalike(a[i - 1], b[j - 1]) ? 0.4 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + swap);
    }
    prev = cur;
  }
  return prev[b.length];
}
