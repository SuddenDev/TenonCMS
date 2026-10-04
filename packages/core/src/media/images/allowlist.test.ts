import { describe, expect, it } from "vitest";
import type { Images } from "./types.ts";
import { allowlist } from "./allowlist.ts";

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
