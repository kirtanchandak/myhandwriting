"use client";

import { useState, type FormEvent } from "react";

export function RenameFont({ id, name }: { id: string; name: string }) {
  const [error, setError] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = String(new FormData(event.currentTarget).get("name") ?? "");
    const response = await fetch(`/api/fonts/${id}/`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: next }),
    });
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok) {
      setError(body?.error || "Could not rename.");
      return;
    }
    location.reload();
  }

  return (
    <form className="rename-font" onSubmit={(event) => void onSubmit(event)}>
      <label>
        Font name
        <input name="name" defaultValue={name} required />
      </label>
      <button type="submit" className="btn btn-ghost">
        Rename
      </button>
      {error && <p className="form-error">{error}</p>}
    </form>
  );
}
