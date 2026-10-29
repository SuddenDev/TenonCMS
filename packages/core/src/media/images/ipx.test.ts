import { describe, expect, it } from "vitest";
import { png4 } from "../../tests/fixtures.ts";
import { dimensions } from "./dimensions.ts";
import type { Storage } from "../storage/types.ts";
import { ipx } from "./ipx.ts";

// A storage that only knows `a/x.png`.
const storage = {
  get: async (key: string) =>
    key === "a/x.png" ? { body: new Blob([png4]).stream(), size: png4.length } : undefined,
} as unknown as Storage;

describe("ipx", () => {
  it("builds /img URLs with sorted modifiers", () => {
    const src = { key: "a b/x.png", url: "", width: 4, height: 4 };
    expect(ipx().getImage(src, { width: 2, format: "webp", quality: 80 }).url).toBe(
      "/_tenon/media/img/f_webp&q_80&w_2/a%20b/x.png",
    );
  });

  it("renders a variant from storage", async () => {
    const out = await ipx().render!("a/x.png", { width: 2, format: "webp" }, storage);
    expect(out.mimeType).toBe("image/webp");
    expect(new TextDecoder().decode(out.data.slice(8, 12))).toBe("WEBP");
    expect(dimensions(out.data)).toEqual({ width: 2, height: 2 });
  });

  it("fails for a missing key", async () => {
    await expect(ipx().render!("nope.png", { width: 2 }, storage)).rejects.toThrow();
  });

  it("passes prerender through", () => {
    expect(ipx({ prerender: true }).prerender).toBe(true);
  });
});
