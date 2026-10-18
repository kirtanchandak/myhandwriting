"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { labelRows, type RowLabel } from "@/lib/ai/label";
import { segmentNotes, type PlacedChar } from "@/lib/ai/notes";
import { readingText } from "@/lib/ai/reading";
import { bankFromGlyphs, buildBank, countByChar, glyphsToTopUp, missingChars } from "@/lib/bank/bank";
import { cleanGlyphs } from "@/lib/scan/tidy";
import { lineText, reviewOrder } from "@/lib/template/guide";
import {
  EMPTY_LIBRARY,
  decodeGlyph,
  encodeGlyph,
  hashBlob,
  upsertPage,
  type Library,
  type PageKind,
  type StoredPage,
} from "@/lib/store/library";
import { maskToDataUrl } from "@/lib/render/draw";
import type { Gray } from "@/lib/scan/image";
import type { GlyphMask, LineInk, PageScan, ScannedGlyph, ScannedLine } from "@/lib/scan/scanPage";
import { useGuide } from "./GuideContext";
import { AlertIcon, CheckIcon, LockIcon, TrashIcon, UploadIcon } from "./Icons";
import { Playground } from "./Playground";

type Photo = {
  id: string;
  name: string;
  blob: Blob;
  previewUrl: string;
  startOverride: number | null;
  /** Stable id for this photo's bytes. Null until hashed. */
  hash: string | null;
  kind: PageKind;
};
type Result =
  | { status: "scanning"; startLine: number }
  | { status: "saved"; samples: number }
  | { status: "done"; startLine: number; scan: PageScan }
  | { status: "error"; startLine: number; error: string };
type RowRead =
  | { status: "reading" }
  | { status: "done"; thumb: string; read: string[]; label: RowLabel }
  | { status: "failed"; thumb: string; message: string };

const SAMPLE_PAGES = ["/samples/page-1.jpg", "/samples/page-2.jpg"];
const SHEET_INK = "#1d2b64";
/** Review thumbnails share one scale and baseline so letter sizes compare honestly. */
const SHEET_UNIT = 46;
const SHEET_ASCENT = 0.85;
const READ_CONCURRENCY = 4;
const NOTES_LIMIT = 5;

let nextId = 1;
const newId = () => `photo-${nextId++}`;
const frame = () => new Promise((r) => setTimeout(r, 16));

function limiter(max: number) {
  let active = 0;
  const waiting: Array<() => void> = [];
  const next = () => {
    if (active >= max) return;
    const job = waiting.shift();
    if (!job) return;
    active++;
    job();
  };
  return <T,>(task: () => Promise<T>) =>
    new Promise<T>((resolve, reject) => {
      waiting.push(() =>
        task()
          .then(resolve, reject)
          .finally(() => {
            active--;
            next();
          }),
      );
      next();
    });
}
const readQueue = limiter(READ_CONCURRENCY);

async function postLine(image: string, repeats: number): Promise<string[]> {
  const body = await postRead(image, { repeats });
  if (!Array.isArray(body.chars)) throw new Error(body.error || "Reading failed.");
  return body.chars;
}

async function postNotes(image: string): Promise<PlacedChar[]> {
  const body = await postRead(image, { mode: "notes" });
  if (!Array.isArray(body.placed)) throw new Error(body.error || "Reading failed.");
  return body.placed;
}

async function postRead(image: string, extra: { repeats?: number; mode?: "notes" }) {
  const res = await fetch("/api/read-line/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image, ...extra }),
  });
  const body = (await res.json().catch(() => null)) as { chars?: string[]; placed?: PlacedChar[]; error?: string } | null;
  if (!res.ok || !body) throw new Error(body?.error || `Reading failed (${res.status}).`);
  return body;
}

const isRedo = (r: RowRead) => r.status === "failed" || (r.status === "done" && !r.label.glyphs);

function noteLabel(value: PlacedChar[] | Error, row: LineInk, id: string): RowLabel {
  if (value instanceof Error) return { chars: [], lineNumber: null, glyphs: null };
  const glyphs = segmentNotes(row, value, id);
  return { chars: value.map((p) => p.char), lineNumber: null, glyphs: glyphs.length ? glyphs : null };
}

export function Studio({ fontId }: { fontId: string }) {
  const { guide } = useGuide();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [results, setResults] = useState<Record<string, Result>>({});
  const [reads, setReads] = useState<Record<string, RowRead[]>>({});
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [ai, setAi] = useState<boolean | null>(null);
  const [library, setLibrary] = useState<Library>(EMPTY_LIBRARY);
  const [libraryReady, setLibraryReady] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<PageKind>("template");
  const [noteNotice, setNoteNotice] = useState("");
  const [dragging, setDragging] = useState(false);
  const [loadingSample, setLoadingSample] = useState(false);
  const grays = useRef(new Map<string, Gray>());
  const libraryRef = useRef(library);
  libraryRef.current = library;
  const excludedRef = useRef(excluded);
  excludedRef.current = excluded;
  const saving = useRef(new Set<string>());
  const photosRef = useRef(photos);
  photosRef.current = photos;
  const readCache = useRef(new Map<string, Promise<unknown>>());
  const runId = useRef(0);
  const inputId = useId();

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/fonts/${fontId}/`)
      .then((r) => r.json() as Promise<{ library?: Library }>)
      .then((body) => {
        if (cancelled || !body.library) return;
        setLibrary(body.library);
        setExcluded(new Set(body.library.excluded));
      })
      .finally(() => {
        if (!cancelled) setLibraryReady(true);
      });
    fetch("/api/read-line/")
      .then((r) => r.json() as Promise<{ enabled?: boolean }>)
      .then((b) => setAi(b.enabled === true))
      .catch(() => setAi(false));
    return () => {
      cancelled = true;
    };
  }, [fontId]);

  const addFiles = useCallback((files: Array<{ blob: Blob; name: string }>, kind: PageKind) => {
    const images = files.filter((f) => f.blob.type.startsWith("image/"));
    if (!images.length) return;
    let take = images;
    if (kind === "notes") {
      const used =
        libraryRef.current.pages.filter((page) => page.kind === "notes").length +
        photosRef.current.filter((photo) => photo.kind === "notes").length;
      const room = NOTES_LIMIT - used;
      if (room <= 0) {
        setNoteNotice(`Notes are limited to ${NOTES_LIMIT} pages.`);
        return;
      }
      if (images.length > room) {
        setNoteNotice(`Added ${room} of ${images.length}. Notes are limited to ${NOTES_LIMIT} pages.`);
        take = images.slice(0, room);
      } else setNoteNotice("");
    }
    const added: Photo[] = take.map((f) => ({
      id: newId(),
      name: f.name,
      blob: f.blob,
      previewUrl: URL.createObjectURL(f.blob),
      startOverride: null,
      hash: null,
      kind,
    }));
    setPhotos((prev) => [...prev, ...added]);
    for (const photo of added) {
      void hashBlob(photo.blob).then((hash) => {
        setPhotos((prev) => prev.map((item) => (item.id === photo.id ? { ...item, hash } : item)));
      });
    }
  }, []);

  const scanKey = `${libraryReady}|${ai}|${guide.variants}|${photos.map((p) => `${p.id}:${p.kind}:${p.hash ?? "?"}:${p.startOverride ?? "a"}`).join(",")}`;

  function cachedRead<T>(key: string, task: () => Promise<T>): Promise<T> {
    let pending = readCache.current.get(key) as Promise<T> | undefined;
    if (!pending) {
      pending = readQueue(task);
      readCache.current.set(key, pending);
      pending.catch(() => readCache.current.delete(key));
    }
    return pending;
  }

  async function readRows(photoId: string, idPrefix: string, rows: LineInk[], run: number, kind: PageKind) {
    const { cropToPng } = await import("@/lib/ai/png");
    if (run !== runId.current) return;
    setReads((r) => ({ ...r, [photoId]: rows.map(() => ({ status: "reading" as const })) }));
    setProgress((p) => ({ ...p, [photoId]: 0 }));
    const thumbs: string[] = [];
    const settled = await Promise.all(
      rows.map(async (row, i) => {
        const png = cropToPng(row);
        thumbs[i] = `data:image/png;base64,${png}`;
        try {
          return kind === "notes"
            ? await cachedRead(`${idPrefix}:${i}:n`, () => postNotes(png))
            : await cachedRead(`${idPrefix}:${i}:t`, () => postLine(png, guide.variants));
        } catch (e) {
          return e instanceof Error ? e : new Error(String(e));
        } finally {
          if (run === runId.current) setProgress((p) => ({ ...p, [photoId]: (p[photoId] ?? 0) + 1 }));
        }
      }),
    );
    if (run !== runId.current) return;
    const labels =
      kind === "notes"
        ? (settled as Array<PlacedChar[] | Error>).map((s, i) => noteLabel(s, rows[i], `${idPrefix}:r${i}`))
        : labelRows(
            (settled as Array<string[] | Error>).map((s) => (s instanceof Error ? [] : s)),
            rows,
            guide,
            idPrefix,
          );
    const list = settled.map((s, i): RowRead =>
      s instanceof Error
        ? { status: "failed", thumb: thumbs[i], message: s.message }
        : {
            status: "done",
            thumb: thumbs[i],
            read: labels[i].chars,
            label: labels[i],
          },
    );
    setReads((r) => ({ ...r, [photoId]: list }));
  }

  useEffect(() => {
    if (!libraryReady || ai === null) return;
    const run = ++runId.current;
    let cancelled = false;
    (async () => {
      const [{ loadPhoto }, { scanPage }] = await Promise.all([
        import("@/lib/scan/loadImage"),
        import("@/lib/scan/scanPage"),
      ]);
      let nextLine = 1;
      for (const photo of photos) {
        if (cancelled || run !== runId.current) return;
        if (!photo.hash) continue;
        const saved = libraryRef.current.pages.find((p) => p.hash === photo.hash);
        if (saved) {
          setResults((r) => ({ ...r, [photo.id]: { status: "saved", samples: saved.glyphs.length } }));
          continue;
        }
        const startLine = photo.startOverride ?? nextLine;
        setResults((r) => ({ ...r, [photo.id]: { status: "scanning", startLine } }));
        await frame();
        try {
          let gray = grays.current.get(photo.id);
          if (!gray) {
            const loaded = await loadPhoto(photo.blob, photo.name);
            gray = loaded.gray;
            grays.current.set(photo.id, gray);
            setPhotos((prev) =>
              prev.map((item) => {
                if (item.id !== photo.id) return item;
                URL.revokeObjectURL(item.previewUrl);
                return { ...item, previewUrl: loaded.previewUrl };
              }),
            );
          }
          await frame();
          const scan = scanPage(gray, guide, startLine, photo.hash);
          if (cancelled || run !== runId.current) return;
          setResults((r) => ({ ...r, [photo.id]: { status: "done", startLine, scan } }));
          if (ai) void readRows(photo.id, photo.hash, scan.rows, run, photo.kind);
          const last = scan.lines.at(-1)?.lineNumber;
          if (last) nextLine = last + 1;
        } catch (e) {
          setResults((r) => ({
            ...r,
            [photo.id]: { status: "error", startLine, error: e instanceof Error ? e.message : String(e) },
          }));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanKey]);

  const lines = useMemo((): ScannedLine[][] => {
    if (ai) return [];
    return photos.flatMap((p) => {
      const r = results[p.id];
      return r?.status === "done" ? [r.scan.lines] : [];
    });
  }, [ai, photos, results]);

  const sessionGlyphs = useMemo(() => {
    const out: ScannedGlyph[] = [];
    const finished = new Set<string>();
    if (ai) {
      for (const photo of photos) {
        const result = results[photo.id];
        const list = reads[photo.id];
        if (result?.status !== "done" || !photo.hash || !list) continue;
        if (list.length !== result.scan.rows.length || list.some((r) => r.status === "reading")) continue;
        finished.add(photo.hash);
        for (const row of list) if (row.status === "done" && row.label.glyphs) out.push(...row.label.glyphs);
      }
    } else {
      for (const photo of photos) {
        const result = results[photo.id];
        if (result?.status === "done" && photo.hash) finished.add(photo.hash);
      }
      for (const page of buildBank(lines).values()) out.push(...page);
    }
    return { glyphs: out, finished };
  }, [ai, photos, results, reads, lines]);

  const libraryGlyphs = useMemo(
    () => cleanGlyphs(library.pages.flatMap((page) => page.glyphs.map(decodeGlyph))),
    [library],
  );
  const pendingGlyphs = useMemo(() => {
    const saved = new Set(library.pages.map((page) => page.hash));
    return cleanGlyphs(
      sessionGlyphs.glyphs.filter((glyph) => !saved.has(glyph.id.split(":")[0]) && !removed.has(glyph.id)),
    );
  }, [library, sessionGlyphs, removed]);
  const allGlyphs = useMemo(
    () =>
      [...libraryGlyphs, ...glyphsToTopUp(countByChar(libraryGlyphs), pendingGlyphs)].filter(
        (glyph) => !removed.has(glyph.id),
      ),
    [libraryGlyphs, pendingGlyphs, removed],
  );
  const bank = useMemo(() => bankFromGlyphs(allGlyphs, excluded), [allGlyphs, excluded]);
  const allBank = useMemo(() => bankFromGlyphs(allGlyphs), [allGlyphs]);
  useEffect(() => {
    if (!libraryReady) return;
    let cancelled = false;
    const saved = new Set(library.pages.map((page) => page.hash));
    const counts = countByChar(library.pages.flatMap((page) => page.glyphs));
    for (const photo of photos) {
      if (!photo.hash || !sessionGlyphs.finished.has(photo.hash) || saved.has(photo.hash) || saving.current.has(photo.hash)) {
        continue;
      }
      const glyphs = glyphsToTopUp(
        counts,
        cleanGlyphs(sessionGlyphs.glyphs.filter((glyph) => glyph.id.startsWith(`${photo.hash}:`) && !removed.has(glyph.id))),
      );
      for (const glyph of glyphs) counts.set(glyph.char, (counts.get(glyph.char) ?? 0) + 1);
      const page: StoredPage = {
        hash: photo.hash,
        name: photo.name,
        kind: photo.kind,
        savedAt: Date.now(),
        glyphs: glyphs.map(encodeGlyph),
      };
      saving.current.add(photo.hash);
      void fetch(`/api/fonts/${fontId}/pages/`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(page),
      })
        .then((response) => response.json() as Promise<{ page?: StoredPage; error?: string }>)
        .then((body) => {
          if (cancelled) return;
          if (!body.page) {
            saving.current.delete(photo.hash!);
            setSaveError(body.error || "Could not save this page.");
            return;
          }
          setLibrary((prev) => upsertPage(prev, body.page!));
          for (const glyph of body.page.glyphs) {
            if (!excludedRef.current.has(glyph.id)) continue;
            void fetch(`/api/fonts/${fontId}/glyphs/${encodeURIComponent(glyph.id)}/`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ excluded: true }),
            });
          }
        })
        .catch(() => {
          saving.current.delete(photo.hash!);
          if (!cancelled) setSaveError("Could not save this page.");
        });
    }
    return () => {
      cancelled = true;
    };
  }, [libraryReady, photos, sessionGlyphs, library, fontId, removed]);

  const masks = useMemo(() => {
    const m = new Map<string, GlyphMask>();
    for (const list of allBank.values()) for (const g of list) m.set(g.id, g.mask);
    return m;
  }, [allBank]);

  const okLines = new Set<number>();
  for (const page of lines) for (const l of page) if (l.ok) okLines.add(l.lineNumber);
  const flagged = new Map<number, { message: string; photo: string }>();
  const redoRows: Array<{ key: string; photo: string; read: RowRead }> = [];
  let rowCount = 0;
  let rowsReading = 0;
  photos.forEach((p) => {
    const r = results[p.id];
    if (r?.status !== "done") return;
    if (ai) {
      const list = reads[p.id] ?? [];
      rowCount += r.scan.rows.length;
      if (list.some((x) => x?.status === "reading") || list.length < r.scan.rows.length) {
        rowsReading += r.scan.rows.length - (progress[p.id] ?? 0);
      }
      list.forEach((read, i) => {
        if (read && isRedo(read)) redoRows.push({ key: `${p.id}:${i}`, photo: p.name, read });
      });
      return;
    }
    for (const l of r.scan.lines) {
      if (!l.ok && !okLines.has(l.lineNumber)) flagged.set(l.lineNumber, { message: l.message ?? "", photo: p.name });
    }
  });
  const missing = missingChars(bank, guide.charset);
  const scanning =
    rowsReading > 0 || photos.some((p) => results[p.id]?.status === "scanning" || !results[p.id]);
  const linesToWrite = guide.lines
    .filter((l) => l.glyphs.some((g) => missing.includes(g.char)))
    .map((l) => l.number);

  const removePhoto = (id: string) => {
    setPhotos((prev) => prev.filter((p) => p.id !== id));
    grays.current.delete(id);
  };

  const loadSamples = async () => {
    setLoadingSample(true);
    try {
      const blobs = await Promise.all(SAMPLE_PAGES.map((u) => fetch(u).then((r) => r.blob())));
      addFiles(
        blobs.map((blob, i) => ({ blob, name: `Sample page ${i + 1}` })),
        "template",
      );
    } finally {
      setLoadingSample(false);
    }
  };

  return (
    <div className="studio">
      <div className="studio-upload">
        <div className="mode-switch" role="group" aria-label="What you are uploading">
          <button type="button" className="btn btn-ghost" aria-pressed={mode === "template"} onClick={() => setMode("template")}>
            Template pages
          </button>
          <button type="button" className="btn btn-ghost" aria-pressed={mode === "notes"} onClick={() => setMode("notes")}>
            Notes, up to {NOTES_LIMIT} pages
          </button>
        </div>
        <label
          htmlFor={inputId}
          className={`dropzone${dragging ? " is-dragging" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            addFiles(
              [...e.dataTransfer.files].map((f) => ({ blob: f, name: f.name })),
              mode,
            );
          }}
        >
          <span className="dropzone-icon">
            <UploadIcon />
          </span>
          <span className="dropzone-title">{mode === "notes" ? "Add photos of your notes" : "Add photos of your pages"}</span>
          <span className="muted small">
            {mode === "notes"
              ? "Everyday handwriting works. Each letter is topped up to 3 samples; full cards are left alone."
              : "Add the lines you still need. Each letter is topped up to 3 samples; full cards are left alone."}
          </span>
          <input
            id={inputId}
            type="file"
            accept="image/*"
            multiple
            className="visually-hidden"
            onChange={(e) => {
              addFiles(
                [...(e.target.files ?? [])].map((f) => ({ blob: f, name: f.name })),
                mode,
              );
              e.target.value = "";
            }}
          />
        </label>
        <div className="upload-aside">
          <p className="privacy">
            <LockIcon />
            {ai
              ? " Photos are processed on this device. Each row of letters is sent to an AI model to be read, then discarded."
              : " Photos stay on this device."}
          </p>
          {ai === false && (
            <p className="muted small">
              AI reading is off, so rows are matched to the guide in order. Set OPENROUTER_API_KEY on the server to turn it on.
            </p>
          )}
          <p className="muted small">Letters are saved in this font. The photo itself is not kept.</p>
          {noteNotice && <p className="muted small">{noteNotice}</p>}
          {saveError && <p className="muted small">{saveError}</p>}
          <button type="button" className="btn btn-ghost" onClick={loadSamples} disabled={loadingSample}>
            {loadingSample ? "Loading..." : "No pages yet? Try the sample pages"}
          </button>
        </div>
      </div>

      {photos.length > 0 && (
        <ul className="photo-list" aria-label="Your pages">
          {photos.map((p, i) => (
            <PhotoRow
              key={p.id}
              index={i}
              photo={p}
              result={results[p.id]}
              reads={ai ? (reads[p.id] ?? []) : undefined}
              readCount={progress[p.id] ?? 0}
              lineCount={guide.lines.length}
              onStart={(v) =>
                setPhotos((prev) => prev.map((x) => (x.id === p.id ? { ...x, startOverride: v } : x)))
              }
              onRemove={() => removePhoto(p.id)}
            />
          ))}
        </ul>
      )}

      {(allGlyphs.length > 0 || photos.some((p) => results[p.id]?.status === "done")) && (
        <div className="report" aria-live="polite">
          <div className="report-stats">
            {ai && rowCount > 0 && (
              <Stat
                label={rowsReading ? `Reading rows (${rowCount - rowsReading}/${rowCount})` : "Rows read"}
                value={`${rowCount - rowsReading - redoRows.length}/${rowCount}`}
                good={!rowsReading && redoRows.length === 0 && rowCount > 0}
              />
            )}
            {!ai && (
              <Stat
                label="Lines read"
                value={`${okLines.size}/${guide.lines.length}`}
                good={okLines.size === guide.lines.length}
              />
            )}
            <Stat
              label="Characters ready"
              value={`${guide.charset.length - missing.length}/${guide.charset.length}`}
              good={missing.length === 0}
            />
            <Stat label="Samples" value={String([...bank.values()].reduce((n, l) => n + l.length, 0))} />
          </div>

          {flagged.size > 0 && (
            <div className="issues" role="region" aria-label="Lines to redo">
              <h3>
                <AlertIcon /> {flagged.size} {flagged.size === 1 ? "line needs" : "lines need"} a redo
              </h3>
              <p className="muted small">
                Rewrite it on a new page and set &quot;Starts at line&quot; to the first one.
              </p>
              <ul>
                {[...flagged.entries()]
                  .sort((a, b) => a[0] - b[0])
                  .map(([n, f]) => (
                    <li key={n}>
                      <span className="issue-line">
                        <span className="line-no">{n}</span>
                        <code>{lineText(guide.lines[n - 1], guide.variants)}</code>
                      </span>
                      <span className="muted small">
                        {f.message.replace(/^Line \d+: /, "")} ({f.photo})
                      </span>
                    </li>
                  ))}
              </ul>
            </div>
          )}

          {redoRows.length > 0 && (
            <div className="issues" role="region" aria-label="Rows to redo">
              <h3>
                <AlertIcon /> {redoRows.length} {redoRows.length === 1 ? "row" : "rows"} could not be used
              </h3>
              <p className="muted small">Rewrite these on a new page with a small gap between letters, then add it.</p>
              <ul>
                {redoRows.map(({ key, photo, read }) => (
                  <li key={key}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {"thumb" in read && <img src={read.thumb} alt="" className="row-thumb" />}
                    <span className="muted small">
                      {read.status === "failed"
                        ? `${read.message} (${photo})`
                        : read.status === "done"
                          ? `Read as “${readingText(read.label.chars)}”, but the letters touch too closely to separate. (${photo})`
                          : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {ai && !scanning && missing.length > 0 && (
            <p className="muted">
              Still missing {missing.length === 1 ? "one character" : `${missing.length} characters`}:{" "}
              <code>{missing.join(" ")}</code>. Write guide {linesToWrite.length === 1 ? "line" : "lines"}{" "}
              {linesToWrite.join(", ")}, or add a photo of your notes. Letters with fewer than 3 samples get topped up.
            </p>
          )}
          {!ai && !scanning && okLines.size < guide.lines.length && flagged.size === 0 && (
            <p className="muted">
              Lines {firstMissing(okLines, guide.lines.length)} onwards are not added yet. Add the next page.
            </p>
          )}

          <GlyphSheet
            bank={allBank}
            charset={guide.charset}
            excluded={excluded}
            onToggle={(id) => {
              const excludedNow = !excluded.has(id);
              setExcluded((prev) => {
                const next = new Set(prev);
                if (excludedNow) next.add(id);
                else next.delete(id);
                return next;
              });
              void fetch(`/api/fonts/${fontId}/glyphs/${encodeURIComponent(id)}/`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ excluded: excludedNow }),
              });
            }}
            onDelete={(id) => {
              setRemoved((prev) => new Set(prev).add(id));
              setLibrary((prev) => ({
                ...prev,
                excluded: prev.excluded.filter((glyphId) => glyphId !== id),
                pages: prev.pages.map((page) => ({ ...page, glyphs: page.glyphs.filter((glyph) => glyph.id !== id) })),
              }));
              if (library.pages.some((page) => page.glyphs.some((glyph) => glyph.id === id))) {
                void fetch(`/api/fonts/${fontId}/glyphs/${encodeURIComponent(id)}/`, { method: "DELETE" });
              }
            }}
          />
        </div>
      )}

      <Playground bank={bank} masks={masks} missing={missing} ready={bank.size > 0} />
    </div>
  );
}

function firstMissing(ok: Set<number>, total: number) {
  for (let i = 1; i <= total; i++) if (!ok.has(i)) return i;
  return total;
}

function Stat({ label, value, good }: { label: string; value: string; good?: boolean }) {
  return (
    <div className={`stat${good ? " is-good" : ""}`}>
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}

function PhotoRow({
  photo,
  result,
  reads,
  readCount,
  index,
  lineCount,
  onStart,
  onRemove,
}: {
  photo: Photo;
  result?: Result;
  /** Present when AI reads the rows. */
  reads?: RowRead[];
  readCount: number;
  index: number;
  lineCount: number;
  onStart: (v: number | null) => void;
  onRemove: () => void;
}) {
  const selectId = useId();
  let status: React.ReactNode = <span className="chip">Waiting</span>;
  if (!result || result.status === "scanning") status = <span className="chip chip-busy">Reading...</span>;
  else if (result.status === "error") status = <span className="chip chip-bad">Could not read: {result.error}</span>;
  else if (result.status === "saved") {
    status = (
      <span className="chip chip-good">
        <CheckIcon /> Saved, {result.samples} samples
      </span>
    );
  } else if (result.status === "done" && reads && result.scan.rows.length > 0) {
    const total = result.scan.rows.length;
    const busy = reads.length < total || reads.some((r) => r?.status === "reading");
    const bad = reads.filter((r) => r && isRedo(r)).length;
    status =
      busy ? (
        <span className="chip chip-busy">
          AI is reading rows {Math.min(readCount, total)}/{total}
        </span>
      ) : (
        <span className={`chip ${bad ? "chip-warn" : "chip-good"}`}>
          {bad ? <AlertIcon /> : <CheckIcon />}
          {total} {total === 1 ? "row" : "rows"}
          {bad ? `, ${bad} to redo` : ", all read"}
        </span>
      );
  } else if (result.status === "done" && !result.scan.ok) status = <span className="chip chip-bad">{result.scan.message}</span>;
  else if (result.status === "done") {
    const ok = result.scan.lines.filter((l) => l.ok).length;
    const bad = result.scan.lines.length - ok;
    const first = result.scan.lines[0]?.lineNumber;
    const last = result.scan.lines.at(-1)?.lineNumber;
    status = (
      <span className={`chip ${bad ? "chip-warn" : "chip-good"}`}>
        {bad ? <AlertIcon /> : <CheckIcon />}
        Lines {first}-{last}
        {bad ? `, ${bad} to redo` : ", all read"}
      </span>
    );
  }
  return (
    <li className="photo-row">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={photo.previewUrl} alt="" className="photo-thumb" />
      <div className="photo-meta">
        <span className="photo-name">
          Page {index + 1} <span className="muted small">{photo.name}</span>
        </span>
        {status}
      </div>
      {!reads && photo.kind !== "notes" && (
        <div className="field-inline">
          <label htmlFor={selectId}>Starts at line</label>
          <select
            id={selectId}
            value={photo.startOverride ?? "auto"}
            onChange={(e) => onStart(e.target.value === "auto" ? null : Number(e.target.value))}
          >
            <option value="auto">Auto{result && "startLine" in result ? ` (${result.startLine})` : ""}</option>
            {Array.from({ length: lineCount }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                {i + 1}
              </option>
            ))}
          </select>
        </div>
      )}
      <button type="button" className="icon-btn" onClick={onRemove} aria-label={`Remove page ${index + 1}`}>
        <TrashIcon />
      </button>
    </li>
  );
}

function GlyphSheet({
  bank,
  charset,
  excluded,
  onToggle,
  onDelete,
}: {
  bank: Map<string, ScannedGlyph[]>;
  charset: readonly string[];
  excluded: Set<string>;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const order = useMemo(() => reviewOrder(charset), [charset]);
  const urls = useMemo(() => {
    const m = new Map<string, string>();
    for (const list of bank.values()) for (const g of list) m.set(g.id, maskToDataUrl(g.mask, SHEET_INK));
    return m;
  }, [bank]);
  const total = [...bank.values()].reduce((n, l) => n + l.length, 0);
  const missing = order.filter((char) => !bank.get(char)?.length).length;
  return (
    <details className="sheet" open>
      <summary>
        Review your letters <span className="muted">({total} samples{missing ? `, ${missing} missing` : ""})</span>
      </summary>
      <p className="muted small">
        Capitals sit next to their small letters. Tap a sample to leave it out. Tap again to bring it back, or delete it once it is left out.
      </p>
      <div className="sheet-grid">
        {order.map((char) => {
          const list = bank.get(char) ?? [];
          return (
          <div key={char} className={`sheet-cell${list.length ? "" : " is-empty"}`}>
            <span className="sheet-char">{char}</span>
            {list.length === 0 ? (
              <span className="sheet-missing">Missing</span>
            ) : (
            <div className="sheet-samples">
              {list.map((g, i) => (
                <span key={g.id} className="sample-wrap">
                  <button
                    type="button"
                    className="sample"
                    aria-pressed={!excluded.has(g.id)}
                    aria-label={`${char} sample ${i + 1}${excluded.has(g.id) ? ", left out" : ""}`}
                    onClick={() => onToggle(g.id)}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={urls.get(g.id)}
                      alt=""
                      style={{
                        height: g.metrics.heightU * SHEET_UNIT,
                        top: (SHEET_ASCENT + g.metrics.topU) * SHEET_UNIT,
                      }}
                    />
                  </button>
                  {excluded.has(g.id) && (
                    <button type="button" className="sample-delete" onClick={() => onDelete(g.id)}>
                      Delete
                    </button>
                  )}
                </span>
              ))}
            </div>
            )}
          </div>
          );
        })}
      </div>
    </details>
  );
}
