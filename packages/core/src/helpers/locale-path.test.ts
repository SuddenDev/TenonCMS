import { describe, expect, it } from "vitest";
import { localeFromPath, localizePath, switchTarget } from "./locale-path.ts";

const locales = ["en", "de"] as const;
const except = { locales, defaultLocale: "en" };
const always = { ...except, routing: { prefix: "always" } as const };
const off = { ...except, routing: false } as const;

describe("localeFromPath", () => {
  it("reads the prefix", () => {
    expect(localeFromPath("/de/about", except)).toEqual({ locale: "de", path: "/about" });
    expect(localeFromPath("/de/about", always)).toEqual({ locale: "de", path: "/about" });
  });

  it("takes the default locale for an unprefixed path", () => {
    expect(localeFromPath("/about", except)).toEqual({ locale: "en", path: "/about" });
    expect(localeFromPath("/about", always)).toEqual({ locale: "en", path: "/about" });
  });

  it("reads the default locale's own prefix", () => {
    expect(localeFromPath("/en/about", always)).toEqual({ locale: "en", path: "/about" });
  });

  it("keeps a prefix that is not a locale in the path", () => {
    expect(localeFromPath("/fr/about", except)).toEqual({ locale: "en", path: "/fr/about" });
    expect(localeFromPath("/deutsch", except)).toEqual({ locale: "en", path: "/deutsch" });
  });

  it("handles the root, a lone prefix and trailing slashes", () => {
    expect(localeFromPath("/", except)).toEqual({ locale: "en", path: "/" });
    expect(localeFromPath("/de", except)).toEqual({ locale: "de", path: "/" });
    expect(localeFromPath("/de/", except)).toEqual({ locale: "de", path: "/" });
    expect(localeFromPath("/de/about/", except)).toEqual({ locale: "de", path: "/about/" });
  });

  it("keeps a query string", () => {
    expect(localeFromPath("/de?x=1", except)).toEqual({ locale: "de", path: "/?x=1" });
    expect(localeFromPath("/de/a?x=1", except)).toEqual({ locale: "de", path: "/a?x=1" });
  });

  it("reads no prefix without routing", () => {
    expect(localeFromPath("/de/about", off)).toEqual({ locale: "en", path: "/de/about" });
  });
});

describe("localizePath", () => {
  it("prefixes other locales", () => {
    expect(localizePath("/about", "de", except)).toBe("/de/about");
    expect(localizePath("/", "de", except)).toBe("/de");
    expect(localizePath("/about/", "de", except)).toBe("/de/about/");
  });

  it("leaves the default locale unprefixed with except-default", () => {
    expect(localizePath("/about", "en", except)).toBe("/about");
    expect(localizePath("/", "en", except)).toBe("/");
  });

  it("prefixes every locale with always", () => {
    expect(localizePath("/about", "en", always)).toBe("/en/about");
    expect(localizePath("/", "en", always)).toBe("/en");
  });

  it("returns the path without routing", () => {
    expect(localizePath("/about", "de", off)).toBe("/about");
  });
});

describe("switchTarget", () => {
  it("uses the alternate of the target locale", () => {
    expect(switchTarget(except, "/about", "de", { en: "/about", de: "/de/ueber-uns" })).toBe(
      "/de/ueber-uns",
    );
  });

  it("localizes the current path without an alternate", () => {
    expect(switchTarget(except, "/about", "de")).toBe("/de/about");
    expect(switchTarget(except, "/about", "de", { en: "/about" })).toBe("/de/about");
    expect(switchTarget(except, "/about", "en", null)).toBe("/about");
  });
});
