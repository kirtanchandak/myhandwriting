"use client";

import { useEffect, useMemo, useState } from "react";
import { bankFromGlyphs } from "@/lib/bank/bank";
import { drawLayout, maskToDataUrl } from "@/lib/render/draw";
import { DEFAULT_LAYOUT, layoutText } from "@/lib/render/layout";
import type { GlyphMask, ScannedGlyph } from "@/lib/scan/scanPage";
import { decodeGlyph, type StoredGlyph } from "@/lib/store/library";
import { penGlyph } from "@/lib/font/pen";
import { GROUPS } from "@/lib/template/guide";

const INK = "#1d2b64";
const PEN_INK = "#c5d4ff";
const PEN_UNIT = 46;
const PEN_ASCENT = 0.78;

type LetterView = "samples" | "pen";

export function HandPage({ name, slug, glyphs }: { name: string; slug: string; glyphs: StoredGlyph[] }) {
  const [view, setView] = useState<LetterView>("pen");
  const decoded = useMemo(() => glyphs.map(decodeGlyph), [glyphs]);
  const penned = useMemo(() => decoded.map(penGlyph), [decoded]);
  const bank = useMemo(() => bankFromGlyphs(decoded), [decoded]);
  const penBank = useMemo(() => bankFromGlyphs(penned), [penned]);
  const masks = useMemo(() => maskMap(decoded), [decoded]);
  const penMasks = useMemo(() => maskMap(penned), [penned]);
  const samples = decoded.length;
  const characters = bank.size;
  const variants = [...bank.values()].reduce((max, list) => Math.max(max, list.length), 0);
  const fontUrl = `/h/${slug}/font/`;
  const css = faceCss(name, fontUrl);

  return (
    <main className="hand">
      <header className="hand-hero container">
        <p className="eyebrow">A handwriting font</p>
        <h1>{name}</h1>
        <p className="lede">
          Every letter comes from this handwriting. The page rotates through the samples, so a letter never looks
          stamped twice.
        </p>
        <ul className="hand-stats">
          <li>
            <strong>{characters}</strong>
            <span>characters</span>
          </li>
          <li>
            <strong>{samples}</strong>
            <span>samples</span>
          </li>
          <li>
            <strong>{variants || 1}</strong>
            <span>{variants === 1 ? "variant" : "variants"} per letter</span>
          </li>
        </ul>
      </header>

      <section className="container hand-section" aria-labelledby="write-title">
        <div className="hand-section-head">
          <h2 id="write-title">Write something</h2>
          <p>Click the sheet and type. Letters change between samples as you go.</p>
        </div>
        <ViewSwitch view={view} onChange={setView} />
        <TypeSheet name={name} bank={view === "pen" ? penBank : bank} masks={view === "pen" ? penMasks : masks} />
        <p className="muted small">
          Your text stays in this browser. Samples are the ink from the page. Pen redraws each letter with one steady
          stroke, which is also the downloaded font.
        </p>
      </section>

      <section className="container hand-section" aria-labelledby="chars-title">
        <div className="hand-section-head">
          <h2 id="chars-title">Every character</h2>
          <p>
            {view === "pen"
              ? "Each letter, redrawn with one nib."
              : "Up to three samples of each letter, taken from the pages that were uploaded."}
          </p>
        </div>
        <ViewSwitch view={view} onChange={setView} />
        {GROUPS.map((group) => {
          const chars = group.chars.filter((char) => bank.get(char)?.length);
          if (!chars.length) return null;
          return (
            <div key={group.id} className="hand-group">
              <h3>{group.title}</h3>
              {view === "pen" ? (
                <PenBoard chars={chars} glyphs={chars.map((char) => penBank.get(char)?.[0]).filter((glyph) => glyph !== undefined)} masks={penMasks} />
              ) : (
                <div className="hand-grid">
                  {chars.map((char) => (
                    <CharSamples key={char} char={char} glyphs={bank.get(char) ?? []} masks={masks} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </section>

      <section className="container hand-section" aria-labelledby="made-title">
        <div className="hand-section-head">
          <h2 id="made-title">From notebook photos to a font</h2>
        </div>
        <ol className="hand-steps">
          <li>
            <strong>Separate the ink.</strong> The pen is lifted off the paper, and the ruled lines come away.
          </li>
          <li>
            <strong>Find the letters.</strong> Each row is read, then cut into one sample per character.
          </li>
          <li>
            <strong>Keep three of each.</strong> Later pages fill in what is missing and top a letter up to three samples.
          </li>
          <li>
            <strong>Redraw with one pen.</strong> Each letter is thinned to its centre and filled back in with a steady stroke. That is the font file.
          </li>
        </ol>
      </section>

      <section className="container hand-section" aria-labelledby="use-title">
        <div className="hand-section-head">
          <h2 id="use-title">Use it</h2>
          <p>Download the font, or point a page at it.</p>
        </div>
        <p>
          <a className="btn btn-primary" href={`${fontUrl}?download=1`}>
            Download {name}
          </a>
        </p>
        <CssBlock css={css} />
      </section>
    </main>
  );
}

function maskMap(glyphs: ScannedGlyph[]): Map<string, GlyphMask> {
  const map = new Map<string, GlyphMask>();
  for (const glyph of glyphs) map.set(glyph.id, glyph.mask);
  return map;
}

function ViewSwitch({ view, onChange }: { view: LetterView; onChange: (view: LetterView) => void }) {
  return (
    <div className="view-switch" role="group" aria-label="How letters are drawn">
      <button type="button" aria-pressed={view === "samples"} onClick={() => onChange("samples")}>
        Samples
      </button>
      <button type="button" aria-pressed={view === "pen"} onClick={() => onChange("pen")}>
        Pen
      </button>
    </div>
  );
}

function PenBoard({
  chars,
  glyphs,
  masks,
}: {
  chars: string[];
  glyphs: ScannedGlyph[];
  masks: Map<string, GlyphMask>;
}) {
  const byChar = new Map(glyphs.map((glyph) => [glyph.char, glyph]));
  return (
    <div className="pen-board">
      {chars.map((char) => {
        const glyph = byChar.get(char);
        return glyph ? <PenCell key={char} glyph={glyph} mask={masks.get(glyph.id)} /> : null;
      })}
    </div>
  );
}

function PenCell({ glyph, mask }: { glyph: ScannedGlyph; mask?: GlyphMask }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    setUrl(mask ? maskToDataUrl(mask, PEN_INK) : "");
  }, [mask]);
  return (
    <div className="pen-cell">
      {url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={glyph.char}
          style={{
            height: glyph.metrics.heightU * PEN_UNIT,
            top: (PEN_ASCENT + glyph.metrics.topU) * PEN_UNIT,
          }}
        />
      )}
    </div>
  );
}

function TypeSheet({
  name,
  bank,
  masks,
}: {
  name: string;
  bank: ReturnType<typeof bankFromGlyphs>;
  masks: Map<string, GlyphMask>;
}) {
  const [text, setText] = useState(`Hello, this is ${name}.`);
  const [size, setSize] = useState(64);
  const layout = useMemo(
    () => layoutText(text, bank, { ...DEFAULT_LAYOUT, width: 880, size, wobble: 0.6, seed: 3 }),
    [text, bank, size],
  );
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  useEffect(() => {
    if (!canvas) return;
    drawLayout(canvas, layout, masks, { ink: INK, paper: "ruled" }, Math.min(2, window.devicePixelRatio || 1));
  }, [canvas, layout, masks]);
  const missing = [...new Set(layout.missing)].filter((char) => char.trim());
  return (
    <div className="hand-tester">
      <label className="hand-size">
        Size
        <input
          type="range"
          min={36}
          max={96}
          value={size}
          onChange={(event) => setSize(Number(event.target.value))}
        />
        <span>{size}px</span>
      </label>
      <div className="hand-sheet">
        <textarea value={text} onChange={(event) => setText(event.target.value)} aria-label="Your text" rows={4} />
        <canvas ref={setCanvas} />
      </div>
      {missing.length > 0 && (
        <p className="muted small">
          No sample yet for <code>{missing.join(" ")}</code>
        </p>
      )}
    </div>
  );
}

function CharSamples({
  char,
  glyphs,
  masks,
}: {
  char: string;
  glyphs: ScannedGlyph[];
  masks: Map<string, GlyphMask>;
}) {
  const [urls, setUrls] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    const map = new Map<string, string>();
    for (const glyph of glyphs) {
      const mask = masks.get(glyph.id);
      if (mask) map.set(glyph.id, maskToDataUrl(mask, INK));
    }
    setUrls(map);
  }, [glyphs, masks]);
  return (
    <figure className="hand-char">
      <figcaption>{char}</figcaption>
      <div>
        {glyphs.map((glyph) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={glyph.id} src={urls.get(glyph.id)} alt="" style={{ height: glyph.metrics.heightU * 42 }} />
        ))}
      </div>
    </figure>
  );
}

function CssBlock({ css }: { css: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="hand-css">
      <button
        type="button"
        className="btn btn-ghost"
        onClick={() => {
          void navigator.clipboard.writeText(css).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
      >
        {copied ? "Copied" : "Copy CSS"}
      </button>
      <pre>
        <code>{css}</code>
      </pre>
    </div>
  );
}

function faceCss(name: string, url: string): string {
  const family = name.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `@font-face {
  font-family: "${family}";
  src: url("${url}") format("truetype");
  font-weight: 400;
  font-display: swap;
}

.handwritten {
  font-family: "${family}", "Segoe Print", cursive;
  font-size: 1.15em;
  line-height: 1.6;
  color: #1d2b64;
}`;
}
