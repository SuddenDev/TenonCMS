import { describe, expect, it } from "vitest";
import { resolveTemplate } from "./resolve-template.ts";

describe("resolveTemplate", () => {
  it("walks into groups and a related document", () => {
    const doc = { slug: "a", seo: { lang: "de" }, category: { id: "c1", slug: "news" } };
    expect(resolveTemplate("/{seo.lang}/{category.slug}/{slug}", doc)).toBe("/de/news/a");
  });

  it("writes numbers", () => {
    expect(resolveTemplate("/p/{n}", { n: 3 })).toBe("/p/3");
  });

  it("returns null when a value is missing or empty", () => {
    expect(resolveTemplate("/posts/{slug}", {})).toBeNull();
    expect(resolveTemplate("/posts/{slug}", { slug: "" })).toBeNull();
    expect(resolveTemplate("/{category.slug}", { category: "c1" })).toBeNull();
    expect(resolveTemplate("/{seo.lang}", { seo: null })).toBeNull();
  });
});
