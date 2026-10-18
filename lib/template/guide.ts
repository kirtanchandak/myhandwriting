/**
 * Single source of truth for what the user writes on ordinary ruled paper.
 *
 * The scanner has no printed grid to rely on, so labels come from order: the
 * user copies `lines` top to bottom, continuing onto as many pages as needed,
 * and uploads the photos in order. Each line holds a known sequence of glyphs,
 * left to right. A line whose glyph count does not match `glyphs.length`, or a
 * total line count other than `lines.length`, must be flagged, not guessed.
 */

export const GUIDE_VERSION = 1;

export type GroupId = "upper" | "lower" | "digits" | "symbols";

export const GROUPS: ReadonlyArray<{ id: GroupId; title: string; chars: readonly string[] }> = [
  { id: "upper", title: "Capital letters", chars: [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"] },
  { id: "lower", title: "Small letters", chars: [..."abcdefghijklmnopqrstuvwxyz"] },
  { id: "digits", title: "Numbers", chars: [..."0123456789"] },
  { id: "symbols", title: "Punctuation and symbols", chars: [...".,;:!?'\"-()/&@#%+=_"] },
];

export const CHARSET: readonly string[] = GROUPS.flatMap((g) => g.chars);

export type GuideOptions = {
  /** Samples of each character, written next to each other. */
  variants?: number;
  /** Distinct characters per written line. Defaults to about 9 glyphs per line. */
  charsPerLine?: number;
};

export const DEFAULTS = { variants: 3 };

/** Keeps a line short enough to fit a narrow notebook with letter-wide gaps. */
export const TARGET_GLYPHS_PER_LINE = 9;

/** Typical ruled lines on one notebook page, used only for the page estimate. */
export const RULED_LINES_PER_PAGE = 28;

export const LIMITS: Record<keyof GuideOptions, { min: number; max: number }> = {
  variants: { min: 1, max: 5 },
  charsPerLine: { min: 1, max: TARGET_GLYPHS_PER_LINE },
};

export type GlyphSlot = {
  char: string;
  /** 0-based sample index for this character. */
  variant: number;
  /** 0-based position across the whole guide. */
  index: number;
};

export type GuideLine = {
  /** 1-based, as shown to the user. */
  number: number;
  group: GroupId;
  chars: string[];
  /** Expected glyphs, left to right. */
  glyphs: GlyphSlot[];
};

export type WritingGuide = {
  version: number;
  variants: number;
  charsPerLine: number;
  charset: string[];
  /** Users write on every other ruled line so descenders and ascenders never touch. */
  skipRuledLine: true;
  lines: GuideLine[];
};

function resolveOptions(options: GuideOptions): Required<GuideOptions> {
  const variants = options.variants ?? DEFAULTS.variants;
  const o = {
    variants,
    charsPerLine: options.charsPerLine ?? Math.max(1, Math.floor(TARGET_GLYPHS_PER_LINE / variants)),
  };
  for (const key of Object.keys(LIMITS) as Array<keyof GuideOptions>) {
    const v = o[key];
    const { min, max } = LIMITS[key];
    if (!Number.isInteger(v) || v < min || v > max) {
      throw new RangeError(`${key} must be an integer in [${min}, ${max}], got ${v}`);
    }
  }
  return o;
}

export function buildGuide(options: GuideOptions = {}): WritingGuide {
  const o = resolveOptions(options);
  const lines: GuideLine[] = [];
  let index = 0;
  for (const group of GROUPS) {
    for (let i = 0; i < group.chars.length; i += o.charsPerLine) {
      const chars = group.chars.slice(i, i + o.charsPerLine);
      const glyphs = chars.flatMap((char) =>
        Array.from({ length: o.variants }, (_, variant) => ({ char, variant, index: index++ })),
      );
      lines.push({ number: lines.length + 1, group: group.id, chars, glyphs });
    }
  }
  return {
    version: GUIDE_VERSION,
    variants: o.variants,
    charsPerLine: o.charsPerLine,
    charset: [...CHARSET],
    skipRuledLine: true,
    lines,
  };
}

/** Review order: each capital beside its small letter, then digits and symbols. */
export function reviewOrder(charset: readonly string[]): string[] {
  const have = new Set(charset);
  const paired = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"].flatMap((c) => [c, c.toLowerCase()]);
  return [...paired.filter((c) => have.has(c)), ...charset.filter((c) => !paired.includes(c))];
}

export function estimatedPages(guide: WritingGuide): number {
  const ruled = guide.lines.length * (guide.skipRuledLine ? 2 : 1);
  return Math.ceil(ruled / RULED_LINES_PER_PAGE);
}

/** What the user copies onto the line, e.g. "A A A   B B B". */
export function lineText(line: GuideLine, variants: number): string {
  return line.chars.map((c) => Array(variants).fill(c).join(" ")).join("   ");
}

export function guideToJson(guide: WritingGuide): string {
  return JSON.stringify(guide, null, 2);
}

export function guideFromJson(json: string): WritingGuide {
  const parsed = JSON.parse(json) as WritingGuide;
  if (parsed.version !== GUIDE_VERSION) {
    throw new Error(`Unsupported guide version ${parsed.version}`);
  }
  return parsed;
}
