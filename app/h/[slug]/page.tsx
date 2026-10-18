import { HandPage } from "@/app/components/HandPage";
import { SiteHeader } from "@/app/components/SiteHeader";
import { currentUser } from "@/lib/auth/session";
import { publicHand } from "@/lib/db/fonts";
import { notFound } from "next/navigation";

export default async function PublishedHand({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const hand = publicHand(slug);
  if (!hand) notFound();
  const user = await currentUser();
  return (
    <>
      <SiteHeader user={user} />
      <HandPage name={hand.name} slug={hand.slug} glyphs={hand.glyphs} />
    </>
  );
}
