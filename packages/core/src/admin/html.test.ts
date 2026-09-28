import { describe, expect, it } from "vitest";
import { adminPath } from "./html.ts";

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
