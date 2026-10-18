"use client";

export function LogoutButton() {
  return (
    <button
      type="button"
      className="btn btn-ghost"
      onClick={() => {
        void fetch("/api/auth/logout/", { method: "POST" }).then(() => {
          location.href = "/";
        });
      }}
    >
      Log out
    </button>
  );
}
