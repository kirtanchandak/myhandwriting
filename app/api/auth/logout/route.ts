import { deleteSession } from "@/lib/db/accounts";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { cookies } from "next/headers";

export async function POST() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) deleteSession(token);
  jar.delete(SESSION_COOKIE);
  return Response.json({ ok: true });
}
