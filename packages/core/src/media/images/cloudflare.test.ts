import { describe, expect, it } from "vitest";
import type { Storage } from "../storage/types.ts";
import { cloudflare } from "./cloudflare.ts";

const src = {
  key: "a b/x.jpg",
  url: "/api/cms/media/files/a%20b/x.jpg",
  width: 2000,
  height: 1000,
};

describe("cloudflare", () => {
  it("builds /cdn-cgi/image URLs with a stable option order", () => {
    const { getImage } = cloudflare();
    expect(getImage(src, { quality: 80, format: "webp", width: 640 }).url).toBe(
      "/cdn-cgi/image/width=640,format=webp,quality=80/api/cms/media/files/a%20b/x.jpg",
    );
    expect(getImage(src, { fit: "fill", height: 10, width: 20 }).url).toBe(
      "/cdn-cgi/image/width=20,height=10,fit=scale-down/api/cms/media/files/a%20b/x.jpg",
    );
  });

  it("keeps absolute source URLs", () => {
    const url = "https://media.example.com/x.jpg";
    expect(cloudflare().getImage({ ...src, url }, { width: 1 }).url).toBe(
      `/cdn-cgi/image/width=1/${url}`,
    );
  });

  it("does not render", () => {
    expect(cloudflare().render).toBeUndefined();
  });
});

describe("cloudflare with the Images binding", () => {
  const calls: unknown[] = [];
  const binding = {
    input(stream: ReadableStream<Uint8Array>) {
      calls.push(["input", stream]);
      const handle = {
        transform(options: object) {
          calls.push(["transform", options]);
          return handle;
        },
        async output(options: object) {
          calls.push(["output", options]);
          return {
            contentType: () => "image/webp",
            image: () => new Blob([new Uint8Array([1, 2, 3])]).stream(),
          };
        },
      };
      return handle;
    },
  };
  const storage = {
    get: async (key: string) =>
      key === "a b/x.jpg" ? { body: new Blob(["img"]).stream(), size: 3 } : undefined,
  } as unknown as Storage;

  it("serves variants from core", () => {
    expect(cloudflare({ binding }).getImage(src, { width: 640, format: "webp" }).url).toBe(
      "/api/cms/media/img/f_webp&w_640/a%20b/x.jpg",
    );
  });

  it("renders through the binding with Cloudflare's names", async () => {
    calls.length = 0;
    const modifiers = {
      width: 640,
      height: 320,
      fit: "fill",
      format: "webp",
      quality: 80,
    } as const;
    const out = await cloudflare({ binding }).render!("a b/x.jpg", modifiers, storage);
    expect(out).toEqual({ data: new Uint8Array([1, 2, 3]), mimeType: "image/webp" });
    expect(calls.slice(1)).toEqual([
      ["transform", { width: 640, height: 320, fit: "scale-down" }],
      ["output", { format: "image/webp", quality: 80 }],
    ]);
  });

  it("keeps the original format without a format modifier", async () => {
    calls.length = 0;
    await cloudflare({ binding }).render!("a b/x.jpg", { width: 10 }, storage);
    expect(calls.at(-1)).toEqual(["output", { format: "image/jpeg" }]);
  });

  it("throws for a missing original", async () => {
    await expect(cloudflare({ binding }).render!("nope.jpg", {}, storage)).rejects.toThrow();
  });

  it("prerenders on request", () => {
    expect(cloudflare({ binding, prerender: true }).prerender).toBe(true);
  });
});
