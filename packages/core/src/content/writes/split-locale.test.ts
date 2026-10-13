import { describe, expect, it } from "vitest";
import { splitLocale } from "./split-locale.ts";

describe("splitLocale", () => {
  it("moves localized keys out of the shared data", () => {
    expect(splitLocale(["title", "seo"], { title: "A", hero: "m1", seo: { x: 1 } })).toEqual({
      shared: { hero: "m1" },
      localized: { title: "A", seo: { x: 1 } },
    });
  });

  it("returns an empty localized object when no key is present", () => {
    expect(splitLocale(["title"], { hero: "m1" })).toEqual({
      shared: { hero: "m1" },
      localized: {},
    });
  });

  it("keeps null values of localized keys", () => {
    expect(splitLocale(["title"], { title: null }).localized).toEqual({ title: null });
  });

  it("keeps everything shared for an unlocalized entry", () => {
    const data = { title: "A", hero: "m1" };
    expect(splitLocale([], data)).toEqual({ shared: data, localized: {} });
  });
});
