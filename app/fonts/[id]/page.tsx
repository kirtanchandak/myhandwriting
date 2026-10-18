import { GuideProvider } from "@/app/components/GuideContext";
import { SiteHeader } from "@/app/components/SiteHeader";
import { Studio } from "@/app/components/Studio";
import { currentUser } from "@/lib/auth/session";
import { libraryFor } from "@/lib/db/fonts";
import { notFound, redirect } from "next/navigation";
import { DeleteFont } from "../DeleteFont";
import { RenameFont } from "../RenameFont";

export default async function FontPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/login/");
  const { id } = await params;
  const found = libraryFor(user.id, id);
  if (!found) notFound();
  return (
    <>
      <SiteHeader user={user} />
      <main className="section">
        <div className="container">
          <p className="muted small">
            <a href="/fonts/">Your fonts</a>
          </p>
          <div className="font-toolbar">
            <RenameFont id={id} name={found.name} />
            <DeleteFont id={id} name={found.name} />
          </div>
          <GuideProvider>
            <Studio fontId={id} />
          </GuideProvider>
        </div>
      </main>
    </>
  );
}
