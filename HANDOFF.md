# Handoff: Handwriting Font Maker (browser-only, no AI at runtime)

Paste this file into the root of a new repo and open it in Cursor. Start with the "First prompt for Cursor" section at the bottom.

## 1. Goal

A free web app where a person:
1. Reads an on-screen guide listing exactly what to write on each line (no printer needed).
2. Copies those lines onto any ruled notebook page with their own pen.
3. Uploads phone photos of the pages, in order.
4. Types text and sees it rendered in their own handwriting.
5. Downloads the result (PNG/SVG first, installable font later).

Hard constraints:
- **No LLM or ML model in the processing path.** Classic computer vision only.
- **Near-zero running cost.** Everything runs in the user's browser; host as static files.
- **Accessible.** Free, no signup, works on a phone, keyboard-navigable UI, photos never leave the device.

## 2. Why this design (decisions already made)

Reference project: https://github.com/harshpreet931/harshpreet-hand. It turns 120 photos of handwritten notes into a font (OpenCV ink separation, word segmentation, hand-transcribed labels for ~700 words, dynamic-programming letter alignment, potrace vectorizing, fonttools build with `calt` variant rotation). The author reports its Claude Code build cost $13.68. The scripts themselves are plain Python and cheap to run.

The expensive/manual parts there, and what we do instead:

| Reference approach | Our approach |
|---|---|
| Transcribe ~700 words from freeform notes | **Known writing order on ordinary ruled paper** (see 4.1), so every glyph's label comes from its position and no OCR/LLM is needed |
| Per-pen ink color tuning by hand | Auto-detect ink via adaptive threshold on the cropped cell |
| Manually pick best variants | Score samples in code and pick top N |
| G, J, X, punctuation built from other letters | Template captures every character directly |
| Python + system potrace | WASM/JS in the browser |

Non-goals for v1: cursive joins/ligatures, pixel-exact reproduction, accounts, server storage, any ML.

Honest limitation to keep in the UI copy: output looks like the user's handwriting, but it is assembled from letter samples, so it will not be pixel-identical to real writing. Print-style handwriting works well; cursive will look less natural without letter-pair capture (v2).

## 3. Stack

- Next.js (App Router) + TypeScript, static export (`output: 'export'`), deploy on Vercel/Cloudflare Pages/GitHub Pages
- OpenCV.js for perspective correction, thresholding, contours (load lazily; it is large)
- Vectorizing: try a potrace WASM build first; fallback `imagetracerjs` (pure JS). Evaluate both on real samples.
- Rendering: SVG (preferred, scalable) with canvas as fallback
- Font export (v2): see risk R1
- Tests: Vitest for pure logic (layout math, variant picker); Playwright for the happy path

## 4. Architecture

```
/app                 UI routes
/lib/template        writing guide spec (single source of truth for what is written where)
/lib/scan            photo -> deskewed page -> text lines -> labelled glyph crops
/lib/glyph           cell -> cleaned glyph (bitmap -> vector path, metrics)
/lib/bank            glyph bank: Map<char, Glyph[]>, serialize to JSON/IndexedDB
/lib/render          text -> SVG/canvas using the bank (variant picking + jitter)
/lib/font            (v2) bank -> TTF/WOFF2
/fixtures            synthetic filled template + a few real phone photos for tests
```

Key idea: **`lib/template/guide.ts` defines the writing order once** (which characters go on which numbered line, how many samples of each). The guide page and the scanner both import it, so the scanner knows the label of every glyph from its position. Decision (2026-10-18): no printable template; ordinary notebook paper only.

### 4.1 Writing guide spec (implemented)

- Characters: A-Z, a-z, 0-9, and `. , ; : ! ? ' " - ( ) / & @ # % + = _`, in four groups that never share a line.
- Samples per character: default 3 (1-5). Characters per line default to `floor(9 / samples)`, so a line holds about 9 glyphs. Default: 29 lines, 243 glyphs.
- Rules shown to the user: copy lines in order; write on every second ruled line (`skipRuledLine`); sit letters on the ruled line; leave a letter-wide gap between every character; never add or scribble out lines; continue on a new page as needed and upload photos in order.
- Line text shown as e.g. `A A A   B B B   C C C`; screen readers get "capital A, 3 times; ...".

### 4.2 Scan pipeline (per uploaded page photo)

1. Decode image, downscale to ~2000px long edge for detection, keep the original for cropping quality.
2. Find the page outline (largest quadrilateral contour) and warp it flat; if not found, deskew using the dominant angle of the ruled lines (Hough).
3. Detect ruled lines (pale blue/gray, long and near-horizontal) and remove them by color plus morphology. Their positions give each glyph's baseline, and their spacing gives the scale.
4. Binarize ink (adaptive threshold), remove specks, and group ink into text lines by which ruled line it sits on. Ignore the margin area left of a vertical red line if present.
5. Split each text line into glyphs: connected components merged when they overlap horizontally (i, j, !, ?, :, ;, ", %, =), then split at the largest gaps.
6. Validate and label: map text lines in order to `guide.lines`. If the total line count or a line's glyph count does not match the guide, flag that line by number so the UI can ask the user to rewrite just that line (do not guess or silently drop). Labels are only trusted when counts match.

### 4.3 Glyph extraction

For each labelled glyph crop:
- Compute the tight bounding box of ink.
- Normalize vertical placement relative to the ruled line it sits on (baseline) and the line spacing (scale), not the bbox, so lowercase letters keep correct relative height. Estimate x-height per page from the median height of a, c, e, m, n, o, s, u, x, z. Descenders (g, j, p, q, y) and ascenders (b, d, f, h, k, l, t) must keep their offsets.
- Store: bitmap, vectorized path, `advance` (bbox width plus side bearings), `baselineOffset`.
- Score each sample: sharpness (Laplacian variance), typicality (distance of its shape from the median of that character's samples, for example downscaled bitmap distance), ink-edge clipping. Keep the top N, discarding clear outliers.

### 4.4 Renderer (MVP deliverable, no font needed)

`render(text, bank, options) -> SVG`
- Per character, choose a variant: seeded PRNG, never the same variant twice in a row for the same character, and prefer variants that differ from the previous 1-2 picks.
- Small randomized jitter: baseline drift (±1-2% of x-height), rotation (±1°), size (±2%), spacing (±3%). All values adjustable and seeded so output is reproducible.
- Word wrapping and line breaking; optional ruled-paper background; ink color picker.
- Output: SVG and PNG download.

### 4.5 Font export (v2)

Goal: `.ttf`/`.woff2` with 2-3 variants per letter rotating through OpenType `calt`, like the reference project.

## 5. Milestones and acceptance criteria

**M1: Writing guide (done).** On-screen, phone-friendly guide with example, generated from `lib/template/guide.ts`; unit tests on the line math. (A printable PDF template was built first and then removed in favour of notebook paper.)

**M2: Scanner (v1 done, needs real photos).** Photos -> deskewed pages -> text lines -> labelled glyphs, in plain TypeScript (`lib/scan`, no OpenCV.js needed so far): adaptive threshold, projection-based deskew, ruled/margin line removal with stroke-crossing repair, connected components, row bands, and a DP alignment of rows to guide lines that tolerates stray rows. Each photo has a "starts at line" override so a redo page fixes single lines. Synthetic fixtures: `public/samples/page-{1,2}.jpg` (from `scripts/make-samples.ts`), 0 flagged lines in tests. Still open: 3 real phone photos of different notebooks, page perspective (not just rotation), page curl.

**M3: Glyph bank (partial).** `lib/bank/bank.ts` builds `Map<char, samples>`; later successful scans of a line replace earlier ones; samples can be excluded in the review sheet. Bitmaps only (no vectors yet). Still open: automatic scoring/outlier removal, IndexedDB persistence, JSON export.

**M4: Renderer + UI (done).** `lib/render/layout.ts` (seeded variant picking with no repeats, jitter, wrapping, case and quote fallbacks) and `lib/render/draw.ts` (canvas preview, PNG at 2x, SVG with embedded glyph PNGs). Open: verify keyboard-only flow and no-network on a real device.

**M5 (v2): Font export.** AC: installs in a desktop app and in a browser via `@font-face`, variants rotate.

**M6 (v2): Cursive support.** Optional extra template page for common letter pairs and common whole words (the, and, of, to, in...), preferring pair/word samples at render time.

## 6. Risks and open questions

- **R1: Font export in-browser.** opentype.js can build glyph outlines, but writing GSUB `calt` rules may not be supported. Options: (a) Pyodide + fonttools (feaLib compiles the feature rules), (b) one small serverless Python function, (c) ship the SVG renderer only and treat the font as optional. Decide after M4. Verify opentype.js GSUB support first before assuming anything.
- **R2: OpenCV.js size** (several MB). Load lazily after the user picks a photo, show progress, and cache.
- **R3: Phone photo quality** (shadows, blur, curl). Mitigate with adaptive threshold, a "retake" prompt, and an in-app tip: "Use daylight, flat page, fill the frame." A flatbed scan at 300 dpi or higher gives the best results.
- **R3b: No printed markers.** Labels depend on the user following the order and leaving gaps. Touching characters, a skipped character or an extra line shift labels; the count checks in 4.2 step 6 must catch these. Dark or dense ruling (or graph paper) may not separate cleanly from ink by color; detect and tell the user.
- **AI labelling (built, option 2).** When `OPENROUTER_API_KEY` is set on the server, every detected row is sent as an ink-only PNG strip to `POST /api/read-line` (model `OPENROUTER_MODEL`, default `google/gemini-4-argon`, which read a real notebook photo best of the models tested). Labels come from the reading, snapped to the closest guide line when it is within a third of the line's characters (fixes O/0, l/I); touching letters are split at the narrowest ink column. Without a key the app falls back to matching rows to guide lines in order. This needs a Node host (no static export). Existing-notes upload (option 3) is not built yet.
- **R4: Vector tracing quality.** Compare potrace WASM vs imagetracerjs on real pen strokes; pen type and thickness matter. Keeping the cleaned bitmap as a fallback glyph source is acceptable for v1.
- **Open:** print-style vs cursive for the primary user? Pen and paper type? Output target (screen image, printed page, installed font)? These decide whether M6 is needed.

## 7. Accessibility checklist

- Free, no account; all processing local (state this on the page).
- Works on a phone browser; touch targets of at least 44px.
- Full keyboard operation, visible focus, labelled inputs, alt text and a text description for previews.
- Respect `prefers-reduced-motion` and `prefers-color-scheme`.
- Clear error messages that say which line failed and how to fix it.

## 8. First prompt for Cursor

> Read HANDOFF.md. Scaffold a Next.js (App Router, TypeScript, static export) project with the folder structure in section 4. Implement Milestone 1 only: `lib/template/layout.ts` as the single source of truth for the grid (A4 and US Letter, 3 variants per character, characters listed in 4.1, four corner fiducial squares, per-cell guide lines and labels), a `generateTemplatePdf()` using pdf-lib that runs fully client-side, a simple page with a "Download template" button, and Vitest unit tests for the layout math. Do not add any server code or ML. When done, summarize the layout JSON shape so Milestone 2 can reuse it.
