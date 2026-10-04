import { describe, expect, it } from "vitest";
import { parseImgPath } from "./parse-image-path.ts";

describe("parseImgPath", () => {
  it("splits modifiers and key and normalizes the order", () => {
    expect(parseImgPath("w_640&f_webp&q_80/blog/hero.jpg")).toEqual({
      id: "f_webp&q_80&w_640",
      modifiers: { width: 640, format: "webp", quality: 80 },
      key: "blog/hero.jpg",
    });
    expect(parseImgPath("w_640,f_webp/hero.jpg")?.id).toBe("f_webp&w_640");
  });

  it("rejects unknown modifiers and missing keys", () => {
    expect(parseImgPath("x_1/hero.jpg")).toBeUndefined();
    expect(parseImgPath("w_640")).toBeUndefined();
    expect(parseImgPath("w_abc/hero.jpg")).toBeUndefined();
  });
});
