import { describe, expect, it } from "vitest";
import { localeLabel, queryLocale } from "./locale";

describe("localeLabel", () => {
  it("names a language in itself", () => {
    expect(localeLabel("en")).toBe("English");
    expect(localeLabel("de")).toBe("Deutsch");
    expect(localeLabel("fr")).toBe("Français");
  });

  it("names a language in another", () => {
    expect(localeLabel("de", "en")).toBe("German");
  });

  it("keeps regions", () => {
    expect(localeLabel("pt-BR", "en")).toBe("Brazilian Portuguese");
  });

  it("falls back to the code for an invalid one", () => {
    expect(localeLabel("not a locale!")).toBe("not a locale!");
  });
});

describe("queryLocale", () => {
  const locales = ["en", "de"];

  it("returns a configured locale", () => {
    expect(queryLocale("de", locales)).toBe("de");
  });

  it("ignores an unknown one", () => {
    expect(queryLocale("fr", locales)).toBeUndefined();
  });

  it("ignores a missing or repeated value", () => {
    expect(queryLocale(undefined, locales)).toBeUndefined();
    expect(queryLocale(["de", "en"], locales)).toBeUndefined();
    expect(queryLocale(null, locales)).toBeUndefined();
  });
});
