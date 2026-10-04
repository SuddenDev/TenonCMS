import { describe, expect, it } from "vitest";
import type { Images } from "./types.ts";
import { variantsFor } from "./variants-for.ts";

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
