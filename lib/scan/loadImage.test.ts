import { describe, expect, it } from "vitest";
import { looksLikeHeic } from "./loadImage";

const bytes = (text: string) => Uint8Array.from(text, (c) => c.charCodeAt(0));

describe("looksLikeHeic", () => {
  it("recognises a HEIC file header, name, and mime type", () => {
    const header = bytes("....ftypheic");
    expect(looksLikeHeic("", "", header)).toBe(true);
    expect(looksLikeHeic("", "IMG_2541.HEIC", new Uint8Array())).toBe(true);
    expect(looksLikeHeic("image/heic", "photo", new Uint8Array())).toBe(true);
  });

  it("leaves jpeg and png alone", () => {
    expect(looksLikeHeic("image/jpeg", "page.jpg", bytes("\xff\xd8\xff\xe0\x00\x10JFIF"))).toBe(false);
    expect(looksLikeHeic("image/png", "page.png", bytes("\x89PNG\r\n\x1a\n...."))).toBe(false);
  });
});