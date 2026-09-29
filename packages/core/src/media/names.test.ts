import { describe, expect, it } from "vitest";
import { cleanFolder, cleanName, freeName, keyOf } from "./names.ts";

describe("cleanName", () => {
  it("normalizes to NFC and keeps the extension", () => {
    const name = cleanName("Héllo Wörld.JPG");
    expect(name).toBe("Héllo Wörld.JPG".normalize("NFC"));
    expect(name).toBe(name.normalize("NFC"));
  });

  it("removes slashes, control characters and leading dots", () => {
    expect(cleanName("a/b\\c\u0000\u001f.png")).toBe("abc.png");
    expect(cleanName("..hidden.txt")).toBe("hidden.txt");
  });

  it("keeps at most 200 characters with the extension", () => {
    const name = cleanName(`${"a".repeat(300)}.jpeg`);
    expect(name).toHaveLength(200);
    expect(name.endsWith(".jpeg")).toBe(true);
  });

  it("throws for a name that is empty after cleaning", () => {
    expect(() => cleanName("...")).toThrow();
    expect(() => cleanName("")).toThrow();
  });
});

describe("cleanFolder", () => {
  it("is '' at the root", () => {
    expect(cleanFolder("")).toBe("");
    expect(cleanFolder("/")).toBe("");
  });

  it("trims slashes and cleans segments", () => {
    expect(cleanFolder("/blog/2026/")).toBe("blog/2026");
  });

  it("throws for empty, dot and reserved segments", () => {
    for (const bad of ["a//b/../c", "a/./b", "..", ".variants", "a/.tmp", "a/.Variants/b"])
      expect(() => cleanFolder(bad), bad).toThrow();
  });
});

describe("keyOf", () => {
  it("joins folder and filename", () => {
    expect(keyOf("", "hero.jpg")).toBe("hero.jpg");
    expect(keyOf("a/b", "hero.jpg")).toBe("a/b/hero.jpg");
  });
});

describe("freeName", () => {
  it("adds a counter before the extension", () => {
    expect(freeName([], "hero.jpg")).toBe("hero.jpg");
    expect(freeName(["hero.jpg"], "hero.jpg")).toBe("hero-1.jpg");
    expect(freeName(["hero.jpg", "hero-1.jpg"], "hero.jpg")).toBe("hero-2.jpg");
    expect(freeName(["README"], "README")).toBe("README-1");
  });

  it("compares case-insensitively", () => {
    expect(freeName(["Hero.JPG"], "hero.jpg")).toBe("hero-1.jpg");
  });
});
