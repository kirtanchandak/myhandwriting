"use client";

import { useState, type FormEvent } from "react";

export function NewFont() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = String(new FormData(event.currentTarget).get("name") ?? "");
    setBusy(true);
    setError("");
    const response = await fetch("/api/fonts/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const body = (await response.json().catch(() => null)) as { font?: { id: string }; error?: string } | null;
    if (!response.ok || !body?.font) {
      setBusy(false);
      setError(body?.error || "Could not create the font.");
      return;
    }
    location.href = `/fonts/${body.font.id}/`;
  }

  return (
    <form className="new-font" onSubmit={(event) => void onSubmit(event)}>
      <label>
        New font
        <input name="name" required placeholder="Kirtan's font" />
      </label>
      <button type="submit" className="btn btn-primary" disabled={busy}>
        {busy ? "Creating…" : "Create"}
      </button>
      {error && <p className="form-error">{error}</p>}
    </form>
  );
}
