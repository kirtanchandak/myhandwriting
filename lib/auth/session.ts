import { cookies } from "next/headers";
import { accountForToken, type Account } from "@/lib/db/accounts";

export const SESSION_COOKIE = "mh_session";
const MONTH = 60 * 60 * 24 * 30;

export async function currentUser(): Promise<Account | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return accountForToken(token);
}

export function sessionCookie(token: string) {
  return {
    name: SESSION_COOKIE,
    value: token,
    options: {
      httpOnly: true,
      sameSite: "lax" as const,
      path: "/",
      maxAge: MONTH,
      secure: process.env.NODE_ENV === "production",
    },
  };
}
