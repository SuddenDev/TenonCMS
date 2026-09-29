import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { adminPath, findFavicon } from "./html.ts";

describe("adminPath", () => {
  it("defaults to /admin and is undefined when disabled", () => {
    expect(adminPath()).toBe("/admin");
    expect(adminPath(true)).toBe("/admin");
    expect(adminPath(false)).toBeUndefined();
  });

  it("normalizes slashes", () => {
    expect(adminPath("/cms/")).toBe("/cms");
    expect(adminPath("//a/b//" as `/${string}`)).toBe("/a/b");
  });

  it.each(["/", "/api/cms", "/api/cms/x", "/a b", '/a"><script>'])("rejects %s", (path) => {
    expect(() => adminPath(path as `/${string}`)).toThrow(/invalid admin path/);
  });
});

describe("findFavicon", () => {
  const dir = mkdtempSync(join(tmpdir(), "favicon-"));

  it("finds the first known favicon in the public dir", () => {
    writeFileSync(join(dir, "favicon.ico"), "");
    expect(findFavicon(dir)).toBe("/favicon.ico");
    writeFileSync(join(dir, "favicon.svg"), "");
    expect(findFavicon(dir)).toBe("/favicon.svg");
  });

  it("returns null without one", () => {
    expect(findFavicon(join(dir, "missing"))).toBeNull();
  });
});
