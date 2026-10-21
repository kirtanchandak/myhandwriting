"use client";

import { useEffect, useMemo, useState } from "react";
import { repairFont, type RepairedFont } from "@/lib/repair";
import { drawLayout, maskToDataUrl } from "@/lib/render/draw";
import { DEFAULT_LAYOUT, layoutText } from "@/lib/render/layout";
import type { GlyphMask, ScannedGlyph } from "@/lib/scan/scanPage";
import { decodeGlyph, type StoredGlyph } from "@/lib/store/library";
import { GROUPS } from "@/lib/template/guide";

const INK = "#1d2b64";

export function HandPage({ name, slug, glyphs }: { name: string; slug: string; glyphs: StoredGlyph[] }) {
  const decoded = useMemo(() => glyphs.map(decodeGlyph), [glyphs]);
  const font = useMemo(() => repairFont(decoded), [decoded]);
  const { bank, masks } = font;
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
        <TypeSheet name={name} font={font} />
        <p className="muted small">Your text stays in this browser. Letters are your own ink, lined up and spaced.</p>
      </section>

      <section className="container hand-section" aria-labelledby="chars-title">
        <div className="hand-section-head">
          <h2 id="chars-title">Every character</h2>
          <p>Up to three samples of each letter, trimmed to the ink and set on one baseline.</p>
        </div>
        {GROUPS.map((group) => {
          const chars = group.chars.filter((char) => bank.get(char)?.length);
          if (!chars.length) return null;
          return (
            <div key={group.id} className="hand-group">
              <h3>{group.title}</h3>
              <div className="hand-grid">
                {chars.map((char) => (
                  <CharSamples key={char} char={char} glyphs={bank.get(char) ?? []} masks={masks} />
                ))}
              </div>
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
            <strong>Separate the ink</strong>
            <span>The pen is lifted off the paper, and the ruled lines come away.</span>
          </li>
          <li>
            <strong>Find the letters</strong>
            <span>Each row is read, then cut into one sample per character.</span>
          </li>
          <li>
            <strong>Keep three of each</strong>
            <span>Later pages fill in what is missing and top a letter up to three samples.</span>
          </li>
          <li>
            <strong>Line them up</strong>
            <span>Each sample is trimmed to its ink, set on one baseline at one size, and spaced by its shape. That is the font file.</span>
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

function TypeSheet({ name, font }: { name: string; font: RepairedFont }) {
  const [text, setText] = useState(`Hello, this is ${name}.`);
  const [size, setSize] = useState(64);
  const { bank, masks } = font;
  const layout = useMemo(
    () => layoutText(text, bank, { ...DEFAULT_LAYOUT, ...font.layout, width: 880, size, wobble: 0.6, seed: 3 }),
    [text, bank, font.layout, size],
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
