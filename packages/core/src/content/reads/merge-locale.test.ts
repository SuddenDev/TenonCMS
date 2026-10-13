import { describe, expect, it } from "vitest";
import { mergeLocale } from "./merge-locale.ts";

describe("mergeLocale", () => {
  const shared = { hero: "m1", title: "stale" };

  it("takes localized keys from the requested locale", () => {
    expect(mergeLocale(["title"], shared, { title: "Hallo" }, { title: "Hello" })).toEqual({
      hero: "m1",
      title: "Hallo",
    });
  });

  it("falls back to the fallback row, then to null", () => {
    expect(mergeLocale(["title", "body"], shared, {}, { title: "Hello" })).toEqual({
      hero: "m1",
      title: "Hello",
      body: null,
    });
  });

  it("falls back for a stored null", () => {
    expect(mergeLocale(["title"], shared, { title: null }, { title: "Hello" }).title).toBe("Hello");
  });

  it("reads null without a fallback", () => {
    expect(mergeLocale(["title"], shared, undefined, undefined).title).toBeNull();
    expect(mergeLocale(["title"], shared, { title: null }, null).title).toBeNull();
  });

  it("ignores values outside keys in locale rows", () => {
    const out = mergeLocale(["title"], shared, { hero: "stale", title: "Hallo" }, { hero: "x" });
    expect(out.hero).toBe("m1");
  });

  it("keeps falsy values that are not null", () => {
    expect(mergeLocale(["n", "s"], {}, { n: 0, s: "" }, { n: 1, s: "x" })).toEqual({ n: 0, s: "" });
  });

  it("copies shared without mutating it", () => {
    const out = mergeLocale([], shared, { title: "x" }, undefined);
    expect(out).toEqual(shared);
    expect(out).not.toBe(shared);
  });
});
