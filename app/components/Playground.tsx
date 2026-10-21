"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { RepairedFont } from "@/lib/repair";
import { drawLayout, layoutToSvg, type Paper } from "@/lib/render/draw";
import { DEFAULT_LAYOUT, layoutText } from "@/lib/render/layout";
import { DownloadIcon, ShuffleIcon } from "./Icons";

const INKS = [
  { name: "Navy", value: "#1d2b64" },
  { name: "Black", value: "#16161a" },
  { name: "Blue", value: "#1f4fd1" },
  { name: "Green", value: "#1e6b4a" },
  { name: "Red", value: "#b3261e" },
];

const SAMPLE_TEXT =
  "Dear Maya,\nThank you for the lovely dinner on Friday! The pasta was amazing & I still can't stop thinking about it.\nSee you soon - with love, Sam";

const MAX_WIDTH = 1200;
const MIN_WIDTH = 460;

function download(data: BlobPart, type: string, filename: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function Playground({ font, missing, ready }: { font: RepairedFont; missing: string[]; ready: boolean }) {
  const { bank, masks } = font;
  const [text, setText] = useState(SAMPLE_TEXT);
  const [ink, setInk] = useState(INKS[0].value);
  const [paper, setPaper] = useState<Paper>("ruled");
  const [size, setSize] = useState(DEFAULT_LAYOUT.size);
  const [lineHeight, setLineHeight] = useState(DEFAULT_LAYOUT.lineHeight);
  const [wobble, setWobble] = useState(DEFAULT_LAYOUT.wobble);
  const [seed, setSeed] = useState(DEFAULT_LAYOUT.seed);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [outputWidth, setOutputWidth] = useState(MAX_WIDTH);
  const ids = { text: useId(), size: useId(), lh: useId(), wobble: useId(), paper: useId() };

  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const w = Math.round(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, entry.contentRect.width * 1.25)));
      setOutputWidth((prev) => (Math.abs(prev - w) > 24 ? w : prev));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ready]);

  const layout = useMemo(
    () =>
      layoutText(text, bank, {
        ...DEFAULT_LAYOUT,
        ...font.layout,
        width: outputWidth,
        size,
        lineHeight,
        wobble,
        seed,
      }),
    [text, bank, font.layout, size, lineHeight, wobble, seed, outputWidth],
  );

  useEffect(() => {
    if (!ready || !canvasRef.current) return;
    drawLayout(canvasRef.current, layout, masks, { ink, paper }, Math.min(2, window.devicePixelRatio || 1));
  }, [layout, masks, ink, paper, ready]);

  const notFound = [...new Set([...layout.missing])].filter((c) => c.trim());

  const savePng = () => {
    const canvas = document.createElement("canvas");
    drawLayout(canvas, layout, masks, { ink, paper }, 2);
    canvas.toBlob((b) => b && download(b, "image/png", "my-handwriting.png"), "image/png");
  };
  const saveSvg = () => download(layoutToSvg(layout, masks, { ink, paper }, text), "image/svg+xml", "my-handwriting.svg");

  return (
    <div className={`playground${ready ? "" : " is-locked"}`} id="type">
      <div className="pg-head">
        <h3>Type anything in your handwriting</h3>
        {ready && (
          <div className="pg-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setSeed((s) => s + 1)}>
              <ShuffleIcon /> Reshuffle
            </button>
            <button type="button" className="btn btn-ghost" onClick={saveSvg}>
              <DownloadIcon /> SVG
            </button>
            <button type="button" className="btn btn-primary" onClick={savePng}>
              <DownloadIcon /> Download PNG
            </button>
          </div>
        )}
      </div>

      {!ready ? (
        <div className="pg-empty">
          <p>Add a photo of your pages above and your handwriting will appear here.</p>
        </div>
      ) : (
        <div className="pg-body">
          <div className="pg-controls">
            <div className="field">
              <label htmlFor={ids.text}>Your text</label>
              <textarea id={ids.text} value={text} onChange={(e) => setText(e.target.value)} rows={6} />
            </div>
            <fieldset className="field">
              <legend>Ink</legend>
              <div className="swatches">
                {INKS.map((c) => (
                  <label key={c.value} className="swatch" style={{ "--swatch": c.value } as React.CSSProperties}>
                    <input
                      type="radio"
                      name="ink"
                      value={c.value}
                      checked={ink === c.value}
                      onChange={() => setInk(c.value)}
                    />
                    <span className="visually-hidden">{c.name}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="field">
              <label htmlFor={ids.paper}>Paper</label>
              <select id={ids.paper} value={paper} onChange={(e) => setPaper(e.target.value as Paper)}>
                <option value="ruled">Ruled notebook</option>
                <option value="plain">Plain paper</option>
                <option value="transparent">Transparent</option>
              </select>
            </div>
            <Range id={ids.size} label="Size" value={size} min={32} max={110} step={1} onChange={setSize} />
            <Range id={ids.lh} label="Line spacing" value={lineHeight} min={0.9} max={2} step={0.05} onChange={setLineHeight} />
            <Range id={ids.wobble} label="Natural variation" value={wobble} min={0} max={2.5} step={0.1} onChange={setWobble} />
          </div>
          <div className="pg-preview">
            <div className="preview-frame" ref={frameRef}>
              <canvas ref={canvasRef} role="img" aria-label={`Your text in your handwriting: ${text}`} />
            </div>
            {(notFound.length > 0 || missing.length > 0) && (
              <p className="muted small">
                {notFound.length > 0 && (
                  <>
                    Not in your samples yet: <code>{notFound.join(" ")}</code>.{" "}
                  </>
                )}
                {missing.length > 0 && `${missing.length} characters still missing from your pages.`}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Range(props: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="field">
      <label htmlFor={props.id}>
        {props.label} <span className="muted small">{props.value}</span>
      </label>
      <input
        id={props.id}
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
      />
    </div>
  );
}
