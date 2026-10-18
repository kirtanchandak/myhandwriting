import { currentUser } from "@/lib/auth/session";
import { listFonts } from "@/lib/db/fonts";
import { CHARSET } from "@/lib/template/guide";
import { redirect } from "next/navigation";
import { SiteHeader } from "../components/SiteHeader";
import { DeleteFont } from "./DeleteFont";
import { NewFont } from "./NewFont";

export default async function FontsPage() {
  const user = await currentUser();
  if (!user) redirect("/login/");
  const fonts = listFonts(user.id);
  return (
    <>
      <SiteHeader user={user} />
      <main className="section">
        <div className="container">
          <div className="section-head">
            <h1>Your fonts</h1>
            <p className="muted">Each font is a separate project. Upload pages on its own screen and fill in the letters it is missing.</p>
          </div>
          <NewFont />
          {fonts.length === 0 ? (
            <p className="muted">No fonts yet. Create one, for example Kirtan&apos;s font.</p>
          ) : (
            <ul className="font-list">
              {fonts.map((font) => (
                <li key={font.id} className="font-card">
                  <a href={`/fonts/${font.id}/`}>
                    <span className="font-name">{font.name}</span>
                    <span className="muted small">
                      {font.ready}/{CHARSET.length} characters · {font.samples} samples
                    </span>
                  </a>
                  <DeleteFont id={font.id} name={font.name} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </>
  );
}
