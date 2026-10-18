"use client";

import { useState } from "react";

export function PublishFont({
  id,
  published,
  slug,
  ready,
}: {
  id: string;
  published: boolean;
  slug: string | null;
  ready: boolean;
}) {
  const [state, setState] = useState({ published, slug: slug ?? "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const toggle = async (next: boolean) => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/fonts/${id}/publish/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ published: next }),
      });
      const body = (await response.json()) as { slug?: string; published?: boolean; error?: string };
      if (!response.ok || body.error) {
        setError(body.error || "Could not update this page.");
        return;
      }
      setState({ published: body.published === true, slug: body.slug ?? "" });
    } catch {
      setError("Could not update this page.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="publish-font">
      <a className="btn btn-ghost" href={`/api/fonts/${id}/font/?download=1`}>
        Download font
      </a>
      {state.published && state.slug ? (
        <>
          <a className="btn btn-primary" href={`/h/${state.slug}/`}>
            View page
          </a>
          <button type="button" className="btn btn-ghost" onClick={() => toggle(false)} disabled={busy}>
            Unpublish
          </button>
        </>
      ) : (
        <button type="button" className="btn btn-primary" onClick={() => toggle(true)} disabled={busy || !ready}>
          {busy ? "Publishing…" : "Publish my handwriting"}
        </button>
      )}
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}
