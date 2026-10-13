import { describe, expect, it, vi } from "vitest";
import type { Localization } from "../../cms/config/options.ts";
import type { LocalApi } from "../../schema/index.ts";
import { permalinkUrl, previewUrl } from "./resolve-url.ts";

const cms = {} as LocalApi;
const fields = { slug: { type: "text" } } as const;

describe("previewUrl", () => {
  it("falls back to permalink", async () => {
    const entry = { fields, permalink: "/posts/{slug}" };
    expect(await previewUrl(entry, { slug: "a" }, cms)).toBe("/posts/a");
  });

  it("prefers an explicit preview", async () => {
    const entry = { fields, permalink: "/posts/{slug}", preview: "/preview/{slug}" };
    expect(await previewUrl(entry, { slug: "a" }, cms)).toBe("/preview/a");
  });

  it("returns null without preview and permalink", async () => {
    expect(await previewUrl({ fields }, { slug: "a" }, cms)).toBeNull();
  });

  it("passes the form state and cms to a function", async () => {
    const fn = vi.fn(() => "/x");
    const entry = { fields, permalink: fn };
    expect(await previewUrl(entry, { slug: "a" }, cms)).toBe("/x");
    expect(fn).toHaveBeenCalledWith({ slug: "a" }, { cms });
  });
});

const l = (routing: Localization["routing"]): Localization => ({
  locales: ["en", "de"],
  defaultLocale: "en",
  fallback: true,
  routing,
});
const except = l({ prefix: "except-default" });
const always = l({ prefix: "always" });
const entry = { fields, permalink: "/posts/{slug}" };

describe("locale routing", () => {
  it("prefixes the permalink and the preview default", async () => {
    const doc = { slug: "a" };
    expect(await permalinkUrl(entry, doc, cms, { locale: "de", localization: except })).toBe(
      "/de/posts/a",
    );
    expect(await previewUrl(entry, doc, cms, { locale: "de", localization: except })).toBe(
      "/de/posts/a",
    );
  });

  it("leaves the default locale unprefixed except with always", async () => {
    const doc = { slug: "a" };
    expect(await permalinkUrl(entry, doc, cms, { locale: "en", localization: except })).toBe(
      "/posts/a",
    );
    expect(await permalinkUrl(entry, doc, cms, { locale: "en", localization: always })).toBe(
      "/en/posts/a",
    );
    expect(await permalinkUrl(entry, doc, cms, { localization: always })).toBe("/en/posts/a");
  });

  it("uses an explicit preview as it is", async () => {
    const own = { ...entry, preview: "/preview/{slug}" };
    expect(await previewUrl(own, { slug: "a" }, cms, { locale: "de", localization: except })).toBe(
      "/preview/a",
    );
  });

  it("prefixes the result of a function", async () => {
    const fn = { fields, permalink: () => "/x" };
    expect(await permalinkUrl(fn, {}, cms, { locale: "de", localization: except })).toBe("/de/x");
  });

  it("returns null without prefixing", async () => {
    expect(await permalinkUrl(entry, {}, cms, { locale: "de", localization: except })).toBeNull();
  });

  it("passes the locale to a function", async () => {
    const fn = vi.fn(() => "/x");
    await permalinkUrl({ fields, permalink: fn }, {}, cms, { locale: "de", localization: except });
    expect(fn).toHaveBeenCalledWith({}, { cms, locale: "de" });
  });
});

describe("routing: false", () => {
  const none = l(false);

  it("fills {locale} from the explicit locale", async () => {
    const own = { fields, permalink: "/{locale}/blog/{slug}" };
    const doc = { slug: "a", locale: "en" };
    expect(await permalinkUrl(own, doc, cms, { locale: "de", localization: none })).toBe(
      "/de/blog/a",
    );
  });

  it("adds no prefix", async () => {
    expect(
      await permalinkUrl(entry, { slug: "a" }, cms, { locale: "de", localization: none }),
    ).toBe("/posts/a");
  });
});

describe("permalinkUrl", () => {
  it("ignores preview", async () => {
    const entry = { fields, permalink: "/posts/{slug}", preview: "/preview/{slug}" };
    expect(await permalinkUrl(entry, { slug: "a" }, cms)).toBe("/posts/a");
  });

  it("returns null without permalink", async () => {
    expect(await permalinkUrl({ fields, preview: "/p/{slug}" }, { slug: "a" }, cms)).toBeNull();
  });
});
