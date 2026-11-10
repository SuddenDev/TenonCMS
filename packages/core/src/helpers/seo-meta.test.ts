import { expect, it } from "vitest";
import { DEFAULT_SEO_TITLE, seoHead, seoMeta } from "./seo-meta.ts";

it("seoMeta falls back to the title", () => {
  const empty = {
    title: "About",
    description: undefined,
    noindex: false,
    canonical: undefined,
    image: undefined,
    alternates: [],
  };
  expect(seoMeta({ title: "About", seo: null })).toEqual(empty);
  expect(seoMeta({ title: "About" })).toEqual(empty);
  expect(
    seoMeta({ title: "About", seo: { title: "", description: "D", noindex: true } }),
  ).toMatchObject({ title: "About", description: "D", noindex: true });
  expect(seoMeta({ title: "About", seo: { title: "Custom" } }).title).toBe("Custom");
});

it("seoMeta builds the title from the default template", () => {
  const general = { title: "Site" };
  expect(DEFAULT_SEO_TITLE).toBe("{title} · {site.title}");
  expect(seoMeta({ title: "Hello" }, { general }).title).toBe("Hello · Site");
  expect(seoMeta({ title: "Hello" }, { general: {} }).title).toBe("Hello");
  expect(seoMeta({ title: "Hello" }, { general: { title: "" } }).title).toBe("Hello");
  expect(seoMeta({ title: "Hello" }, { general: null, seo: null }).title).toBe("Hello");
});

it("seoMeta takes the title template of the site", () => {
  const general = { title: "Site", tagline: "Fast" };
  const seo = { title: "{title} | {site.title} – {site.tagline}" };
  expect(seoMeta({ title: "Hello" }, { general, seo }).title).toBe("Hello | Site – Fast");
  expect(seoMeta({ title: "Hello" }, { general: { title: "Site" }, seo }).title).toBe(
    "Hello | Site",
  );
  expect(seoMeta({ title: "Hello" }, { general, seo: { title: "" } }).title).toBe("Hello · Site");
});

it("seoMeta puts the page's own title into the title template", () => {
  const general = { title: "Site" };
  expect(seoMeta({ title: "Hello", seo: { title: "Custom" } }, { general }).title).toBe(
    "Custom · Site",
  );
  expect(seoMeta({ title: "Hello", seo: { title: "{title} sale" } }, { general }).title).toBe(
    "Hello sale · Site",
  );
  expect(
    seoMeta(
      { title: "Hello", seo: { title: "Custom" } },
      { general, seo: { title: "{site.title}: {title}" } },
    ).title,
  ).toBe("Site: Custom");
  expect(
    seoMeta(
      { title: "Hello", seo: { title: "Custom" } },
      { general, templates: { title: "{title} – Blog" } },
    ).title,
  ).toBe("Custom – Blog");
});

it("seoMeta uses the page's own title as the whole title with `fullTitle`", () => {
  const general = { title: "Site" };
  expect(
    seoMeta({ title: "Hello", seo: { title: "Custom", fullTitle: true } }, { general }).title,
  ).toBe("Custom");
  expect(
    seoMeta(
      { title: "Hello", seo: { title: "{title}  sale | {site.title}", fullTitle: true } },
      { general },
    ).title,
  ).toBe("Hello sale | Site");
  expect(seoMeta({ title: "Hello", seo: { fullTitle: true } }, { general }).title).toBe(
    "Hello · Site",
  );
});

it("seoMeta prefers the collection's templates to the site's", () => {
  const general = { title: "Site" };
  const templates = { title: "{title} – Blog · {site.title}", description: "About {title}" };
  const seo = { title: "{title} | {site.title}", description: "Site text" };
  expect(seoMeta({ title: "A" }, { general, seo, templates })).toMatchObject({
    title: "A – Blog · Site",
    description: "About A",
  });
  expect(seoMeta({ title: "A", seo: { title: "Own" } }, { general, seo, templates }).title).toBe(
    "Own – Blog · Site",
  );
  expect(seoMeta({ title: "A" }, { general, seo, templates: {} })).toMatchObject({
    title: "A | Site",
    description: "Site text",
  });
  expect(seoMeta({ title: "A" }, { general, templates: null }).title).toBe("A · Site");
});

it("seoMeta fills placeholders from any field, nested ones included", () => {
  const doc = { title: "A", excerpt: "Short", category: { title: "News" }, views: 3 };
  const seo = { title: "{category.title}: {title} ({views})", description: "{excerpt}" };
  expect(seoMeta(doc, { seo })).toMatchObject({ title: "News: A (3)", description: "Short" });
  expect(seoMeta({ title: "A", category: "id1" }, { seo }).title).toBe("A ()");
  expect(
    seoMeta({ title: "A" }, { seo: { description: "{excerpt}" } }).description,
  ).toBeUndefined();
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

it("seoMeta prefers the permalink of a read with `permalink: true` over `path`", () => {
  const general = { url: "https://a.b" };
  expect(seoMeta({ path: "/hallo", permalink: "/de/hallo" }, { general }).canonical).toBe(
    "https://a.b/de/hallo",
  );
  expect(seoMeta({ path: "/about", permalink: null }, { general }).canonical).toBe(
    "https://a.b/about",
  );
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

it("seoMeta falls back to the site's description, not the tagline", () => {
  const general = { title: "Site", tagline: "T" };
  expect(seoMeta({ title: "A" }, { general }).description).toBeUndefined();
  const seo = { description: "Site" };
  expect(seoMeta({ title: "A" }, { general, seo }).description).toBe("Site");
  expect(seoMeta({ title: "A", seo: { description: "Page" } }, { seo }).description).toBe("Page");
});

it("seoHead lists the head tags of seoMeta", () => {
  const image = { url: "/og.png" };
  const doc = { title: "Hi", path: "/hi", locale: "en", alternates: { en: "/hi", de: "/de/hi" } };
  const head = seoHead(
    { ...doc, seo: { description: "D", image, noindex: true } },
    { general: { title: "Acme", url: "https://a.co" } },
  );
  expect(head).toEqual({
    title: "Hi · Acme",
    meta: [
      { name: "description", content: "D" },
      { property: "og:title", content: "Hi · Acme" },
      { property: "og:description", content: "D" },
      { property: "og:image", content: "https://a.co/og.png" },
      { property: "og:url", content: "https://a.co/hi" },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "Acme" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex, nofollow" },
    ],
    links: [
      { rel: "canonical", href: "https://a.co/hi" },
      { rel: "alternate", hreflang: "en", href: "https://a.co/hi" },
      { rel: "alternate", hreflang: "de", href: "https://a.co/de/hi" },
    ],
  });
});

it("seoHead leaves out tags without a value", () => {
  expect(seoHead({ title: "Hi" })).toEqual({
    title: "Hi",
    meta: [
      { property: "og:title", content: "Hi" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [],
  });
});

it("helpers come from the main and the browser-safe client entry", async () => {
  for (const entry of [await import("../index.ts"), await import("../client/index.ts")]) {
    expect(entry).toMatchObject({
      seoMeta,
      seoHead,
      breadcrumbs: expect.any(Function),
      slugify: expect.any(Function),
      localeFromPath: expect.any(Function),
      localizePath: expect.any(Function),
      switchTarget: expect.any(Function),
      SLUG_PATTERN: expect.any(String),
    });
  }
});
