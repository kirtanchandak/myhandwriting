import { randomBytes, randomUUID } from "node:crypto";
import { checkPassword, checkUsername, hashPassword, verifyPassword } from "@/lib/auth/password";
import { getDb } from "./index";

export type Account = { id: string; username: string };

export function createAccount(username: string, password: string): Account | { error: string } {
  const nameError = checkUsername(username);
  if (nameError) return { error: nameError };
  const passwordError = checkPassword(password);
  if (passwordError) return { error: passwordError };
  const name = username.trim();
  const db = getDb();
  const existing = db.prepare("SELECT id FROM users WHERE username = ?").get(name);
  if (existing) return { error: "That username is taken." };
  const account = { id: randomUUID(), username: name };
  db.prepare("INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)").run(
    account.id,
    name,
    hashPassword(password),
    Date.now(),
  );
  return account;
}

export function loginAccount(username: string, password: string): Account | null {
  const row = getDb()
    .prepare("SELECT id, username, password_hash FROM users WHERE username = ?")
    .get(username.trim()) as { id: string; username: string; password_hash: string } | undefined;
  if (!row || !verifyPassword(password, row.password_hash)) return null;
  return { id: row.id, username: row.username };
}

export function createSession(userId: string): string {
  const token = randomBytes(32).toString("hex");
  getDb().prepare("INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)").run(token, userId, Date.now());
  return token;
}

export function accountForToken(token: string): Account | null {
  const row = getDb()
    .prepare(
      `SELECT users.id, users.username FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token = ?`,
    )
    .get(token) as Account | undefined;
  return row ?? null;
}

export function deleteSession(token: string) {
  getDb().prepare("DELETE FROM sessions WHERE token = ?").run(token);
}
