import { describe, expect, it } from "vitest";
import { checkLinkValue, storedLink } from "./value.ts";

describe("checkLinkValue", () => {
  it("accepts a reference or a URL, with a target", () => {
    expect(() => checkLinkValue({ reference: { collection: "pages", id: "1" } })).not.toThrow();
    expect(() => checkLinkValue({ href: "/about", target: "_blank" })).not.toThrow();
    expect(() =>
      checkLinkValue({
        reference: { collection: "pages", id: "1", deleted: true },
        target: "_top",
      }),
    ).not.toThrow();
  });

  it("rejects bad shapes", () => {
    for (const value of [
      "/about",
      [],
      {},
      { reference: { collection: "pages" } },
      { reference: { collection: "", id: "1" } },
      { reference: { collection: "pages", id: "1", deleted: false } },
      { href: 1 },
      { href: "" },
      { href: "/a", target: "_new" },
      { reference: { collection: "pages", id: "1" }, href: "/a" },
    ])
      expect(() => checkLinkValue(value), JSON.stringify(value)).toThrow();
  });

  it("accepts a suffix that starts with ? or # and holds no whitespace", () => {
    for (const suffix of ["#team", "?ref=nav", "?ref=nav#team"])
      expect(() => checkLinkValue({ href: "/a", suffix }), suffix).not.toThrow();
    expect(() =>
      checkLinkValue({ reference: { collection: "pages", id: "1" }, suffix: "#team" }),
    ).not.toThrow();
  });

  it("rejects a bad suffix", () => {
    for (const suffix of ["team", "#", "?", "# a", "#a\u0000", "", 1, null])
      expect(() => checkLinkValue({ href: "/a", suffix }), String(suffix)).toThrow(
        "Invalid link suffix",
      );
  });

  it("rejects executable schemes", () => {
    expect(() => checkLinkValue({ href: "javascript:alert(1)" })).toThrow("Unsafe URL");
  });
});

describe("storedLink", () => {
  it("removes the read decoration of a reference", () => {
    const reference = { collection: "pages", id: "1" };

    expect(
      storedLink({ reference, href: "/about", title: "About", broken: true, target: "_blank" }),
    ).toEqual({ reference, target: "_blank" });
  });

  it("keeps a URL and drops unknown keys", () => {
    expect(storedLink({ href: "/about", extra: 1 })).toEqual({ href: "/about" });
    expect(storedLink({ href: "/about", title: "x", broken: true })).toEqual({ href: "/about" });
  });

  it("keeps the suffix", () => {
    const reference = { collection: "pages", id: "1" };

    expect(storedLink({ reference, suffix: "#team", href: "/x" })).toEqual({
      reference,
      suffix: "#team",
    });
    expect(storedLink({ href: "/a", suffix: "?x=1" })).toEqual({ href: "/a", suffix: "?x=1" });
  });

  it("returns other values unchanged", () => {
    expect(storedLink("/about")).toBe("/about");
    expect(storedLink(null)).toBe(null);
  });
});
