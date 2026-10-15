// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { currentAdminLocale, pickAdminLocale } from "./locale.ts";

describe("pickAdminLocale", () => {
  it("keeps a supported stored choice", () => {
    expect(pickAdminLocale("de", ["en-US"])).toBe("de");
  });

  it("takes the first browser language whose base is supported", () => {
    expect(pickAdminLocale(null, ["fr-FR", "de-AT", "en"])).toBe("de");
  });

  it("ignores an unsupported stored value", () => {
    expect(pickAdminLocale("fr", ["de"])).toBe("de");
  });

  it("falls back to English", () => {
    expect(pickAdminLocale(undefined, ["fr", "es"])).toBe("en");
    expect(pickAdminLocale("", [])).toBe("en");
  });
});

describe("currentAdminLocale", () => {
  it("reads the stored choice of the admin on this origin", () => {
    localStorage.setItem("integral-admin-locale", "de");
    expect(currentAdminLocale()).toBe("de");
    localStorage.clear();
    expect(currentAdminLocale()).toBe("en");
  });
});
