import { describe, expect, it } from "vitest";
import { checkPassword, checkUsername, hashPassword, verifyPassword } from "./password";

describe("passwords", () => {
  it("accepts the password that was hashed and rejects another", () => {
    const stored = hashPassword("correct horse");
    expect(stored).not.toContain("correct horse");
    expect(verifyPassword("correct horse", stored)).toBe(true);
    expect(verifyPassword("wrong", stored)).toBe(false);
    expect(verifyPassword("correct horse", "not-a-hash")).toBe(false);
  });
});

describe("account names", () => {
  it("rejects blank, short, and spaced usernames", () => {
    expect(checkUsername("ab")).toBeNull();
    expect(checkUsername("a")).toMatch(/2/);
    expect(checkUsername("a b")).toMatch(/letters/);
    expect(checkPassword("short")).toMatch(/8/);
    expect(checkPassword("longenough")).toBeNull();
  });
});
