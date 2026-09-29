import { describe, expect, it } from "vitest";
import {
  allowlist,
  type Images,
  modifierId,
  modifiersFor,
  parseImgPath,
  variantsFor,
} from "./images.ts";

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

describe("variantsFor", () => {
  it("uses the field's sizes, else the global ones", () => {
    const widths = (field?: object) =>
      variantsFor(images, field, 5000).srcset.map((v) => v.descriptor);
    expect(widths()).toEqual(["320w", "640w", "1024w"]);
    expect(widths({ sizes: [800, 1600] })).toEqual(["800w", "1600w"]);
  });

  it("drops widths at or above the original and makes the largest one src", () => {
    const v = variantsFor(images, undefined, 640);
    expect(v.srcset.map((x) => x.descriptor)).toEqual(["320w"]);
    expect(v.src).toEqual({ format: "webp", quality: 80, width: 320 });
  });

  it("uses the base modifiers as src when every width is dropped", () => {
    const v = variantsFor(images, undefined, 100);
    expect(v.srcset).toEqual([]);
    expect(v.src).toEqual({ format: "webp", quality: 80 });
  });

  it("gives 1x and 2x for a fixed width without field sizes", () => {
    const v = variantsFor(images, { preset: "avatar" }, 1000);
    expect(v.srcset.map((x) => [x.descriptor, x.modifiers.width, x.modifiers.height])).toEqual([
      ["1x", 128, 128],
      ["2x", 256, 256],
    ]);
    expect(v.src.width).toBe(128);
    expect(variantsFor(images, { preset: "avatar" }, 200).srcset).toHaveLength(1);
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

describe("allowlist", () => {
  it("holds every combination the config can produce", () => {
    const list = allowlist(images, [{ sizes: [800] }, { preset: "og" }]);
    for (const id of [
      "f_webp&q_80",
      "f_webp&q_80&w_320",
      "f_webp&q_80&w_1024",
      "f_webp&q_80&w_800",
      "f_jpeg&fit_cover&h_630&q_85&w_1200",
      "f_jpeg&fit_cover&h_1260&q_85&w_2400",
      "f_webp&fit_cover&h_128&q_80&w_128",
    ])
      expect(list.has(id), id).toBe(true);
    expect(list.has("f_webp&q_80&w_999")).toBe(false);
  });
});

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
