"use client";

import { useId, useState } from "react";
import { GROUPS, LIMITS, estimatedPages, lineText, type GuideLine } from "@/lib/template/guide";
import { useGuide } from "./GuideContext";
import { CheckIcon } from "./Icons";

const VARIANT_CHOICES = Array.from(
  { length: LIMITS.variants.max - LIMITS.variants.min + 1 },
  (_, i) => LIMITS.variants.min + i,
);

const RULES = [
  { title: "Copy the lines in order", body: "Start at the top of a fresh page. Don't write anything else on it." },
  { title: "Skip every other line", body: "One line of characters, one empty line. Tails and tall letters never touch." },
  { title: "Leave a gap", body: "About one letter wide between every character, so none of them touch." },
  { title: "Mistakes are fine", body: "Don't scribble or add lines. Just carry on; you can redo a line later." },
];

export function WriteGuide() {
  const { guide, variants, setVariants } = useGuide();
  const [done, setDone] = useState<Set<number>>(new Set());
  const selectId = useId();
  const pages = estimatedPages(guide);

  const toggle = (n: number) =>
    setDone((prev) => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });

  return (
    <div className="write-grid">
      <div className="write-intro">
        <RuledExample lines={guide.lines.slice(0, 3)} variants={variants} />
        <ol className="rule-list">
          {RULES.map((r, i) => (
            <li key={r.title}>
              <span className="rule-num" aria-hidden="true">
                {i + 1}
              </span>
              <div>
                <strong>{r.title}</strong>
                <p>{r.body}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="kit">
          <p className="kit-title">You need</p>
          <ul>
            <li>Any lined notebook</li>
            <li>A dark pen (gel or felt-tip is best)</li>
            <li>Your phone camera</li>
          </ul>
        </div>
      </div>

      <div className="notebook" aria-labelledby="lines-title">
        <div className="notebook-head">
          <div>
            <h3 id="lines-title">Lines to copy</h3>
            <p className="muted small">
              {guide.lines.length} lines, about {pages} notebook {pages === 1 ? "page" : "pages"}.{" "}
              {done.size > 0 && `${done.size} done.`}
            </p>
          </div>
          <div className="field-inline">
            <label htmlFor={selectId}>Samples each</label>
            <select id={selectId} value={variants} onChange={(e) => setVariants(Number(e.target.value))}>
              {VARIANT_CHOICES.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div
          className="progress"
          role="progressbar"
          aria-label="Lines written"
          aria-valuemin={0}
          aria-valuemax={guide.lines.length}
          aria-valuenow={done.size}
        >
          <span style={{ width: `${(done.size / guide.lines.length) * 100}%` }} />
        </div>
        {GROUPS.map((group) => (
          <section key={group.id} aria-label={group.title} className="line-group">
            <h4>{group.title}</h4>
            <ul className="line-list">
              {guide.lines
                .filter((l) => l.group === group.id)
                .map((line) => (
                  <li key={line.number}>
                    <button
                      type="button"
                      className="line-row"
                      aria-pressed={done.has(line.number)}
                      onClick={() => toggle(line.number)}
                    >
                      <span className="line-no" aria-hidden="true">
                        {line.number}
                      </span>
                      <span className="line-chars" aria-hidden="true">
                        {lineText(line, variants)}
                      </span>
                      <span className="visually-hidden">
                        Line {line.number}: {spokenLine(line, variants)}. Mark as written.
                      </span>
                      <span className="line-check" aria-hidden="true">
                        <CheckIcon />
                      </span>
                    </button>
                  </li>
                ))}
            </ul>
          </section>
        ))}
        <p className="muted small notebook-foot">Tap a line to tick it off while you write.</p>
      </div>
    </div>
  );
}

function RuledExample({ lines, variants }: { lines: GuideLine[]; variants: number }) {
  const gap = 34;
  const width = 520;
  const marginX = 54;
  const rows = lines.length * 2;
  const height = gap * (rows + 0.6);
  return (
    <figure className="example-card">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby="ex-t ex-d" className="ruled-svg">
        <title id="ex-t">How a finished page should look</title>
        <desc id="ex-d">
          The first lines of the guide written on ruled paper, each followed by an empty line, with a clear gap
          between every character.
        </desc>
        <rect width={width} height={height} className="paper" />
        <line x1={marginX} y1={0} x2={marginX} y2={height} className="margin" />
        {Array.from({ length: rows }, (_, i) => (
          <line key={i} x1={0} y1={(i + 1) * gap} x2={width} y2={(i + 1) * gap} className="rule" />
        ))}
        {lines.map((line, i) => (
          <g key={line.number}>
            <text x={marginX + 16} y={(2 * i + 1) * gap - 5} className="hand" xmlSpace="preserve">
              {lineText(line, variants)}
            </text>
            <text x={width - 14} y={(2 * i + 2) * gap - 10} className="skip" textAnchor="end">
              empty
            </text>
          </g>
        ))}
      </svg>
    </figure>
  );
}

const SPOKEN: Record<string, string> = {
  ".": "full stop",
  ",": "comma",
  ";": "semicolon",
  ":": "colon",
  "!": "exclamation mark",
  "?": "question mark",
  "'": "apostrophe",
  '"': "double quote",
  "-": "hyphen",
  "(": "open bracket",
  ")": "close bracket",
  "/": "slash",
  "&": "ampersand",
  "@": "at sign",
  "#": "hash",
  "%": "percent",
  "+": "plus",
  "=": "equals",
  _: "underscore",
};

function spokenLine(line: GuideLine, variants: number): string {
  return line.chars
    .map((c) => {
      const name = SPOKEN[c] ?? (/[a-z]/.test(c) ? `small ${c}` : /[A-Z]/.test(c) ? `capital ${c}` : c);
      return `${name} ${variants} times`;
    })
    .join(", ");
}
