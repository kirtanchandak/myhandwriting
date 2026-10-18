import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const KEY_LEN = 32;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, KEY_LEN).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const got = scryptSync(password, salt, KEY_LEN);
  const want = Buffer.from(hash, "hex");
  if (got.length !== want.length) return false;
  return timingSafeEqual(got, want);
}

export function checkUsername(username: string): string | null {
  const name = username.trim();
  if (!/^[A-Za-z0-9_]{2,32}$/.test(name)) {
    return "Username must be 2–32 letters, numbers, or underscores.";
  }
  return null;
}

export function checkPassword(password: string): string | null {
  if (password.length < 8) return "Password must be at least 8 characters.";
  if (password.length > 200) return "Password is too long.";
  return null;
}

export function checkFontName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return "Give the font a name.";
  if (trimmed.length > 60) return "Name must be 60 characters or fewer.";
  return null;
}
