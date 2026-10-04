import { describe, expect, it } from "vitest";
import { resolve } from "./resolve-template.ts";

describe("resolve", () => {
  it("fills top-level values", () => {
    expect(resolve("/posts/{slug}", { slug: "hello" })).toBe("/posts/hello");
  });

  it("walks into groups and a related document", () => {
    const doc = { slug: "a", seo: { lang: "de" }, category: { id: "c1", slug: "news" } };
    expect(resolve("/{seo.lang}/{category.slug}/{slug}", doc)).toBe("/de/news/a");
  });

  it("writes numbers", () => {
    expect(resolve("/p/{n}", { n: 3 })).toBe("/p/3");
  });

  it("returns null when a value is missing or empty", () => {
    expect(resolve("/posts/{slug}", {})).toBeNull();
    expect(resolve("/posts/{slug}", { slug: "" })).toBeNull();
    expect(resolve("/{category.slug}", { category: "c1" })).toBeNull();
    expect(resolve("/{seo.lang}", { seo: null })).toBeNull();
  });

  it("returns a template without placeholders as is", () => {
    expect(resolve("/", {})).toBe("/");
  });
});
