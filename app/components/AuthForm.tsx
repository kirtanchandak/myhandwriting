"use client";

import { useState, type FormEvent } from "react";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    const response = await fetch(mode === "login" ? "/api/auth/login/" : "/api/auth/signup/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: data.get("username"), password: data.get("password") }),
    });
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok) {
      setBusy(false);
      setError(body?.error || "Something went wrong.");
      return;
    }
    location.href = "/fonts/";
  }

  return (
    <form className="auth-form" onSubmit={(event) => void onSubmit(event)}>
      <label>
        Username
        <input name="username" required autoComplete="username" />
      </label>
      <label>
        Password
        <input
          name="password"
          type="password"
          required
          minLength={mode === "signup" ? 8 : undefined}
          autoComplete={mode === "login" ? "current-password" : "new-password"}
        />
      </label>
      {error && <p className="form-error">{error}</p>}
      <button type="submit" className="btn btn-primary" disabled={busy}>
        {busy ? "Please wait…" : mode === "login" ? "Log in" : "Create account"}
      </button>
    </form>
  );
}
