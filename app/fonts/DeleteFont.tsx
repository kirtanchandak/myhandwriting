"use client";

import { useState } from "react";

export function DeleteFont({ id, name }: { id: string; name: string }) {
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      className="btn btn-ghost"
      disabled={busy}
      onClick={() => {
        if (!confirm(`Delete ${name}? Its letters will be removed.`)) return;
        setBusy(true);
        void fetch(`/api/fonts/${id}/`, { method: "DELETE" }).then(() => {
          location.href = "/fonts/";
        });
      }}
    >
      {busy ? "Deleting…" : "Delete font"}
    </button>
  );
}
