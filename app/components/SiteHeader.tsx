import type { Account } from "@/lib/db/accounts";
import { PenIcon } from "./Icons";
import { LogoutButton } from "./LogoutButton";

export function SiteHeader({ user }: { user: Account | null }) {
  return (
    <header className="site-header">
      <div className="container header-inner">
        <a href="/" className="logo" aria-label="myhandwriting home">
          <span className="logo-mark" aria-hidden="true">
            <PenIcon />
          </span>
          myhandwriting
        </a>
        <nav aria-label="Main">
          <a href="/#how">How it works</a>
          <a href="/#write">Write</a>
          {user ? (
            <>
              <a href="/fonts/">Your fonts</a>
              <span className="muted small">{user.username}</span>
              <LogoutButton />
            </>
          ) : (
            <>
              <a href="/login/">Log in</a>
              <a href="/signup/" className="nav-cta">
                Create account
              </a>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
