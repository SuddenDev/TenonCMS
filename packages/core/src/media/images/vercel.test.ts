import { afterEach, describe, expect, it, vi } from "vitest";
import { src } from "./hosted.fixture.ts";
import { vercel } from "./vercel.ts";

afterEach(() => vi.unstubAllEnvs());

describe("vercel", () => {
  it("returns the original outside Vercel", () => {
    vi.stubEnv("VERCEL", "");
    expect(vercel().getImage(src, { width: 640 }).url).toBe(src.url);
  });

  it("builds /_vercel/image URLs with an allowed width", () => {
    vi.stubEnv("VERCEL", "1");
    const { getImage } = vercel();
    expect(getImage(src, { width: 640, quality: 80, format: "webp" }).url).toBe(
      "/_vercel/image?url=%2F_tenon%2Fmedia%2Ffiles%2Fa%2520b%2Fx.jpg&w=640&q=80",
    );
    expect(getImage(src, { width: 700 }).url).toContain("&w=1024&");
    expect(getImage(src, {}).url).toContain("&w=1920&");
    expect(vercel({ sizes: [500] }).getImage(src, { width: 640 }).url).toContain("&w=500&");
  });
});
