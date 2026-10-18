import type { GlyphMetrics } from "@/lib/scan/scanPage";

export type RenderGlyph = { id: string; char: string; metrics: GlyphMetrics };
export type RenderBank = ReadonlyMap<string, readonly RenderGlyph[]>;

export type LayoutOptions = {
  /** Output width in px. */
  width: number;
  /** Pixels per rule unit (the notebook line spacing the samples were written on). */
  size: number;
  /** Line pitch in rule units. */
  lineHeight: number;
  padding: number;
  /** Extra space after each glyph, in rule units. */
  letterSpacing: number;
  wordSpacing: number;
  /** 0 = rigid, 1 = natural, 2 = messy. */
  wobble: number;
  seed: number;
};

export const DEFAULT_LAYOUT: Omit<LayoutOptions, "width"> = {
  size: 64,
  lineHeight: 1.15,
  padding: 40,
  letterSpacing: 0.06,
  wordSpacing: 0.32,
  wobble: 1,
  seed: 7,
};

export type Placed = {
  glyph: RenderGlyph;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
};

export type TextLayout = {
  placed: Placed[];
  width: number;
  height: number;
  /** Baseline y of every output line, for ruled backgrounds. */
  baselines: number[];
  missing: string[];
};

const NORMALIZE: Record<string, string> = {
  "\u2018": "'",
  "\u2019": "'",
  "\u201C": '"',
  "\u201D": '"',
  "\u2013": "-",
  "\u2014": "-",
  "\u2026": "...",
  "\t": "    ",
};

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Picks a sample index, never repeating the previous pick for that character
 * and avoiding the one before that when there are enough samples.
 */
export function pickVariant(count: number, history: number[], rand: () => number): number {
  if (count <= 1) return 0;
  const avoid = new Set(history.slice(-(count > 2 ? 2 : 1)));
  const options = Array.from({ length: count }, (_, i) => i).filter((i) => !avoid.has(i));
  return options[Math.floor(rand() * options.length)];
}

function resolve(bank: RenderBank, ch: string): readonly RenderGlyph[] | undefined {
  const direct = bank.get(ch);
  if (direct?.length) return direct;
  const swapped = ch === ch.toLowerCase() ? ch.toUpperCase() : ch.toLowerCase();
  return swapped !== ch ? bank.get(swapped) : undefined;
}

type Item = { glyph: RenderGlyph; advance: number; dy: number; scale: number; rotation: number };

export function layoutText(text: string, bank: RenderBank, options: LayoutOptions): TextLayout {
  const o = options;
  const rand = mulberry32(o.seed);
  const jitter = (amount: number) => (rand() * 2 - 1) * amount * o.wobble;
  const history = new Map<string, number[]>();
  const missing = new Set<string>();
  const normalized = [...text].map((c) => NORMALIZE[c] ?? c).join("").replace(/\r\n?/g, "\n");

  const toItems = (word: string): Item[] =>
    [...word].flatMap((ch) => {
      const samples = resolve(bank, ch);
      if (!samples) {
        missing.add(ch);
        return [];
      }
      const h = history.get(ch) ?? [];
      const pick = pickVariant(samples.length, h, rand);
      history.set(ch, [...h, pick].slice(-2));
      const glyph = samples[pick];
      const scale = 1 + jitter(0.03);
      return [
        {
          glyph,
          advance: (glyph.metrics.widthU * scale + o.letterSpacing * (1 + jitter(0.3))) * o.size,
          dy: jitter(0.012) * o.size,
          scale,
          rotation: (jitter(1.2) * Math.PI) / 180,
        },
      ];
    });

  const maxX = o.width - o.padding;
  const pitch = o.lineHeight * o.size;
  const firstBaseline = o.padding + o.size * 0.75;
  const placed: Placed[] = [];
  const baselines: number[] = [firstBaseline];
  let x = o.padding;
  let baseline = firstBaseline;
  const newLine = () => {
    x = o.padding;
    baseline += pitch;
    baselines.push(baseline);
  };

  const paragraphs = normalized.split("\n");
  paragraphs.forEach((para, pi) => {
    if (pi > 0) newLine();
    const words = para.split(/ +/);
    words.forEach((word, wi) => {
      const items = toItems(word);
      const wordWidth = items.reduce((s, it) => s + it.advance, 0);
      if (wi > 0) {
        const space = o.wordSpacing * o.size * (1 + jitter(0.15));
        if (x + space + wordWidth > maxX && x > o.padding) newLine();
        else x += space;
      }
      if (x + wordWidth > maxX && x > o.padding) newLine();
      for (const it of items) {
        const gw = it.glyph.metrics.widthU * o.size * it.scale;
        if (x + gw > maxX && x > o.padding) newLine();
        placed.push({
          glyph: it.glyph,
          x,
          y: baseline + it.glyph.metrics.topU * o.size * it.scale + it.dy,
          w: gw,
          h: it.glyph.metrics.heightU * o.size * it.scale,
          rotation: it.rotation,
        });
        x += it.advance;
      }
    });
  });

  const height = Math.ceil(baseline + o.size * 0.5 + o.padding);
  missing.delete(" ");
  return { placed, width: o.width, height, baselines, missing: [...missing] };
}
