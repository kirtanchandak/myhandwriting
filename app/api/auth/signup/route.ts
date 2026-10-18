import { createAccount, createSession } from "@/lib/db/accounts";
import { sessionCookie } from "@/lib/auth/session";
import { cookies } from "next/headers";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { username?: unknown; password?: unknown } | null;
  if (typeof body?.username !== "string" || typeof body.password !== "string") {
    return Response.json({ error: "Enter a username and password." }, { status: 400 });
  }
  const account = createAccount(body.username, body.password);
  if ("error" in account) return Response.json(account, { status: 400 });
  const cookie = sessionCookie(createSession(account.id));
  (await cookies()).set(cookie.name, cookie.value, cookie.options);
  return Response.json({ user: account });
}
