import { currentUser } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { AuthForm } from "../components/AuthForm";
import { SiteHeader } from "../components/SiteHeader";

export default async function SignupPage() {
  if (await currentUser()) redirect("/fonts/");
  return (
    <>
      <SiteHeader user={null} />
      <main className="section">
        <div className="container narrow auth-card">
          <h1>Create an account</h1>
          <p className="muted">Your fonts are saved to this account, so they stay when you come back.</p>
          <AuthForm mode="signup" />
          <p className="muted small">
            Already have an account? <a href="/login/">Log in</a>
          </p>
        </div>
      </main>
    </>
  );
}
