import { currentUser } from "@/lib/auth/session";

export async function GET() {
  const user = await currentUser();
  return Response.json({ user });
}
