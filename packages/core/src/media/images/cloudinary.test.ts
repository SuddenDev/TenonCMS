import { describe, expect, it } from "vitest";
import { cloudinary } from "./cloudinary.ts";
import { src } from "./hosted.fixture.ts";

const modifiers = { width: 640, height: 320, fit: "cover", format: "jpeg", quality: 80 } as const;

describe("cloudinary", () => {
  it("uses the key without its extension as the public id", () => {
    const { getImage } = cloudinary({ baseURL: "https://res.cloudinary.com/demo/image/upload" });
    expect(getImage(src, { ...modifiers, background: "ffffff", blur: 300 }).url).toBe(
      "https://res.cloudinary.com/demo/image/upload/w_640,h_320,c_lfill,f_jpg,q_80,b_rgb:ffffff,e_blur:300/a%20b/x",
    );
  });

  it("puts the transformations before an auto-upload folder", () => {
    const { getImage } = cloudinary({
      baseURL: "https://res.cloudinary.com/demo/image/upload/tenon",
    });
    expect(getImage(src, { width: 640 }).url).toBe(
      "https://res.cloudinary.com/demo/image/upload/w_640/tenon/a%20b/x.jpg",
    );
  });

  it("fetches the file URL, made absolute with `origin`", () => {
    const { getImage } = cloudinary({
      baseURL: "https://res.cloudinary.com/demo/image/fetch",
      origin: "https://example.com",
    });
    expect(getImage(src, { width: 640 }).url).toBe(
      "https://res.cloudinary.com/demo/image/fetch/w_640/https%3A%2F%2Fexample.com%2F_tenon%2Fmedia%2Ffiles%2Fa%2520b%2Fx.jpg",
    );
  });
});
