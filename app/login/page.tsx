import { currentUser } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { AuthForm } from "../components/AuthForm";
import { SiteHeader } from "../components/SiteHeader";

export default async function LoginPage() {
  if (await currentUser()) redirect("/fonts/");
  return (
    <>
      <SiteHeader user={null} />
      <main className="section">
        <div className="container narrow auth-card">
          <h1>Log in</h1>
          <p className="muted">Open the fonts saved on your account.</p>
          <AuthForm mode="login" />
          <p className="muted small">
            No account yet? <a href="/signup/">Create one</a>
          </p>
        </div>
      </main>
    </>
  );
}
