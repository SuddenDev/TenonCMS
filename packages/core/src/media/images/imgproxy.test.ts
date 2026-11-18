import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { src } from "./hosted.fixture.ts";
import { imgproxy } from "./imgproxy.ts";

const source = Buffer.from(src.url).toString("base64url");
const modifiers = { width: 640, height: 320, fit: "cover", format: "webp", quality: 80 } as const;

describe("imgproxy", () => {
  it("builds unsigned URLs with the file URL as the source", () => {
    expect(imgproxy({ baseURL: "https://img.example.com" }).getImage(src, modifiers).url).toBe(
      `https://img.example.com/unsafe/rt:fill/w:640/h:320/f:webp/q:80/${source}`,
    );
  });

  it("extends a contained image to the box", () => {
    const { getImage } = imgproxy({ baseURL: "https://img.example.com" });
    expect(getImage(src, { width: 640, height: 320, fit: "contain" }).url).toBe(
      `https://img.example.com/unsafe/rt:fit/w:640/h:320/ex:1/${source}`,
    );
  });

  it("signs the path with HMAC-SHA256 of the salt and the path", () => {
    const key = "aa".repeat(32);
    const salt = "bb".repeat(32);
    const path = `/rt:fill/w:640/h:320/f:webp/q:80/${source}`;
    const signature = createHmac("sha256", Buffer.from(key, "hex"))
      .update(Buffer.from(salt, "hex"))
      .update(path)
      .digest("base64url");
    expect(
      imgproxy({ baseURL: "https://img.example.com", key, salt }).getImage(src, modifiers).url,
    ).toBe(`https://img.example.com/${signature}${path}`);
  });
});
