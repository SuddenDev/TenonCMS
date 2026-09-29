import { describe, expect, it } from "vitest";
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
