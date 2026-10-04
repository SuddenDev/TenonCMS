import { describe, expect, it } from "vitest";
import type { Images } from "./types.ts";
import { modifiersFor, modifierId } from "./modifiers.ts";

const images: Images = {
  provider: { getImage: () => ({ url: "" }) },
  format: "webp",
  quality: 80,
  sizes: [320, 640, 1024],
  presets: {
    avatar: { width: 128, height: 128, fit: "cover" },
    og: { width: 1200, height: 630, fit: "cover", format: "jpeg", quality: 85 },
  },
  maxSize: 50 * 1024 ** 2,
};

describe("modifiersFor", () => {
  it("merges global, preset, then the field's own modifiers", () => {
    expect(modifiersFor(images)).toEqual({ format: "webp", quality: 80 });
    expect(modifiersFor(images, { preset: "og" })).toEqual({
      width: 1200,
      height: 630,
      fit: "cover",
      format: "jpeg",
      quality: 85,
    });
    expect(modifiersFor(images, { preset: "og", quality: 60, sizes: [100] })).toMatchObject({
      format: "jpeg",
      quality: 60,
    });
    expect(modifiersFor(images, { sizes: [100] })).not.toHaveProperty("sizes");
  });
});

describe("modifierId", () => {
  it("is IPX syntax with sorted keys", () => {
    expect(modifierId({ width: 640, format: "webp", quality: 80 })).toBe("f_webp&q_80&w_640");
    expect(modifierId({ fit: "cover", height: 10, background: "fff", blur: 2 })).toBe(
      "b_fff&blur_2&fit_cover&h_10",
    );
  });
});
