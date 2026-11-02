import { expect, it } from "vitest";
import { seoMeta } from "./seo-meta.ts";

it("seoMeta falls back to the title", () => {
  expect(seoMeta({ title: "About", seo: null })).toEqual({
    title: "About",
    description: undefined,
    noindex: false,
    canonical: undefined,
    image: undefined,
    verification: [],
    alternates: [],
  });
  expect(seoMeta({ title: "About" })).toEqual({
    title: "About",
    description: undefined,
    noindex: false,
    canonical: undefined,
    image: undefined,
    verification: [],
    alternates: [],
  });
  expect(seoMeta({ title: "About", seo: { title: "", description: "D", noindex: true } })).toEqual({
    title: "About",
    description: "D",
    noindex: true,
    canonical: undefined,
    image: undefined,
    verification: [],
    alternates: [],
  });
  expect(seoMeta({ title: "About", seo: { title: "Custom" } }).title).toBe("Custom");
});

it("seoMeta appends the site title", () => {
  const general = { title: "Site" };
  expect(seoMeta({ title: "Hello" }, { general }).title).toBe("Hello · Site");
  expect(seoMeta({ title: "Hello" }, { general, seo: { separator: " | " } }).title).toBe(
    "Hello | Site",
  );
  expect(seoMeta({ title: "Hello", seo: { title: "Custom" } }, { general }).title).toBe(
    "Custom · Site",
  );
  expect(seoMeta({ title: "Hello" }, { general: {} }).title).toBe("Hello");
  expect(seoMeta({ title: "Hello" }, { general: { title: "" } }).title).toBe("Hello");
  expect(seoMeta({ title: "Hello" }, { general: null, seo: null }).title).toBe("Hello");
});

it("seoMeta sets noindex from the page or the site", () => {
  expect(seoMeta({ seo: { noindex: true } }, { seo: { noindex: false } }).noindex).toBe(true);
  expect(seoMeta({ seo: { noindex: false } }, { seo: { noindex: true } }).noindex).toBe(true);
  expect(seoMeta({}, { seo: { noindex: null } }).noindex).toBe(false);
  expect(seoMeta({}).noindex).toBe(false);
});

it("seoMeta builds the canonical URL", () => {
  expect(seoMeta({ path: "/about" }, { general: { url: "https://a.b" } }).canonical).toBe(
    "https://a.b/about",
  );
  expect(seoMeta({ path: "/about" }, { general: { url: "https://a.b/" } }).canonical).toBe(
    "https://a.b/about",
  );
  expect(seoMeta({ path: "/about" }).canonical).toBeUndefined();
  expect(seoMeta({}, { general: { url: "https://a.b" } }).canonical).toBeUndefined();
});

it("seoMeta lists the alternates as hreflang links", () => {
  const alternates = { en: "/posts/a", de: "/de/posts/b", "x-default": "/posts/a" };
  const general = { url: "https://a.b/" };
  expect(seoMeta({ alternates }, { general }).alternates).toEqual([
    { hreflang: "en", href: "https://a.b/posts/a" },
    { hreflang: "de", href: "https://a.b/de/posts/b" },
    { hreflang: "x-default", href: "https://a.b/posts/a" },
  ]);
  expect(seoMeta({ alternates: { de: "/de/x" } }).alternates).toEqual([
    { hreflang: "de", href: "/de/x" },
  ]);
  expect(seoMeta({ alternates: { de: "https://cdn.x/de" } }, { general }).alternates[0]!.href).toBe(
    "https://cdn.x/de",
  );
  expect(seoMeta({ alternates: null }, { general }).alternates).toEqual([]);
  expect(seoMeta({}, { general }).alternates).toEqual([]);
});

it("seoMeta keeps a subpath of general.url in alternates, like canonical", () => {
  const general = { url: "https://a.b/site/" };
  expect(seoMeta({ alternates: { de: "/de/x" } }, { general }).alternates[0]!.href).toBe(
    "https://a.b/site/de/x",
  );
});

it("seoMeta takes the canonical of the document's locale from its alternates", () => {
  const general = { url: "https://a.b" };
  const alternates = { en: "/posts/a", de: "/de/posts/b" };
  expect(seoMeta({ locale: "de", path: "/x", alternates }, { general }).canonical).toBe(
    "https://a.b/de/posts/b",
  );
  expect(seoMeta({ locale: "de", alternates }).canonical).toBe("/de/posts/b");
  expect(seoMeta({ locale: "fr", path: "/x", alternates }, { general }).canonical).toBe(
    "https://a.b/x",
  );
  expect(seoMeta({ path: "/x", alternates }, { general }).canonical).toBe("https://a.b/x");
});

it("seoMeta picks the image", () => {
  const site = { url: "/media/site.png" };
  const page = { url: "/media/page.png" };
  expect(seoMeta({ seo: { image: page } }, { seo: { image: site } }).image).toBe("/media/page.png");
  expect(seoMeta({}, { seo: { image: site } }).image).toBe("/media/site.png");
  expect(seoMeta({ seo: { image: page } }, { general: { url: "https://a.b/" } }).image).toBe(
    "https://a.b/media/page.png",
  );
  expect(
    seoMeta({ seo: { image: { url: "https://cdn.x/p.png" } } }, { general: { url: "https://a.b" } })
      .image,
  ).toBe("https://cdn.x/p.png");
  expect(seoMeta({ seo: { image: "abc123" } }, { seo: { image: "def456" } }).image).toBeUndefined();
  expect(seoMeta({ seo: { image: "abc123" } }, { seo: { image: site } }).image).toBe(
    "/media/site.png",
  );
  expect(seoMeta({}).image).toBeUndefined();
});

it("seoMeta lists the verification tags", () => {
  expect(seoMeta({}, { seo: { verification: { google: "g", bing: "b" } } }).verification).toEqual([
    { name: "google-site-verification", content: "g" },
    { name: "msvalidate.01", content: "b" },
  ]);
  expect(seoMeta({}, { seo: { verification: { google: "", bing: "b" } } }).verification).toEqual([
    { name: "msvalidate.01", content: "b" },
  ]);
  expect(seoMeta({}, { seo: { verification: { google: "", bing: "" } } }).verification).toEqual([]);
  expect(seoMeta({}, { seo: { verification: null } }).verification).toEqual([]);
  expect(seoMeta({}, {}).verification).toEqual([]);
});

it("seoMeta falls back to the site's description, not the tagline", () => {
  const general = { title: "Site", tagline: "T" };
  expect(seoMeta({ title: "A" }, { general }).description).toBeUndefined();
  const seo = { description: "Site" };
  expect(seoMeta({ title: "A" }, { general, seo }).description).toBe("Site");
  expect(seoMeta({ title: "A", seo: { description: "Page" } }, { seo }).description).toBe("Page");
});

it("helpers come from the main and the browser-safe client entry", async () => {
  for (const entry of [await import("../index.ts"), await import("../client/index.ts")]) {
    expect(entry).toMatchObject({
      seoMeta,
      breadcrumbs: expect.any(Function),
      slugify: expect.any(Function),
      localeFromPath: expect.any(Function),
      localizePath: expect.any(Function),
      switchTarget: expect.any(Function),
      SLUG_PATTERN: expect.any(String),
    });
  }
});
