import { describe, expect, it } from "vitest";
import type { Fields } from "../../../../core/src/schema";
import { linkReferences, linkHost, offersFile, urlFromText } from "./links";

describe("urlFromText", () => {
  it("keeps URLs, paths and fragments", () => {
    expect(urlFromText(" https://example.com/a ")).toBe("https://example.com/a");
    expect(urlFromText("mailto:a@b.co")).toBe("mailto:a@b.co");
    expect(urlFromText("/about")).toBe("/about");
    expect(urlFromText("#top")).toBe("#top");
  });

  it("adds https to a domain", () => {
    expect(urlFromText("example.com")).toBe("https://example.com");
    expect(urlFromText("www.example.com/shop")).toBe("https://www.example.com/shop");
  });

  it("ignores titles and unsafe URLs", () => {
    expect(urlFromText("About us")).toBeUndefined();
    expect(urlFromText("about")).toBeUndefined();
    expect(urlFromText("javascript:alert(1)")).toBeUndefined();
    expect(urlFromText("")).toBeUndefined();
  });
});

describe("linkHost", () => {
  it("shows the host of a web URL and other URLs as they are", () => {
    expect(linkHost("https://www.example.com/a?b")).toBe("www.example.com");
    expect(linkHost("/about")).toBe("/about");
    expect(linkHost("mailto:a@b.co")).toBe("mailto:a@b.co");
  });
});

describe("linkReferences", () => {
  it("finds references at every depth and skips URLs", () => {
    const fields = {
      cta: { type: "link" },
      items: {
        type: "array",
        fields: {
          link: { type: "link" },
          box: { type: "group", fields: { link: { type: "link" } } },
        },
      },
    } as unknown as Fields;
    const a = { collection: "pages", id: "a" };
    const b = { collection: "pages", id: "b" };

    expect(
      linkReferences(fields, {
        cta: { reference: a },
        items: [{ link: { href: "/x" }, box: { link: { reference: b } } }, { link: null }],
      }),
    ).toEqual([a, b]);
  });
});

describe("offersFile", () => {
  it("offers a file for a file word, even with matches", () => {
    for (const text of ["file", "Datei", "my files", "dateien"])
      expect(offersFile(text, 3)).toBe(true);
    expect(offersFile("profile", 0)).toBe(true);
    expect(offersFile("profile", 2)).toBe(false);
  });

  it("offers a file when nothing matches and the text is not a URL", () => {
    expect(offersFile("menu", 0)).toBe(true);
    expect(offersFile("menu", 1)).toBe(false);
    for (const text of ["https://example.com", "mailto:a@b.co", "tel:123", "/about", "example.com"])
      expect(offersFile(text, 0)).toBe(false);
  });
});
