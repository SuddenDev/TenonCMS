import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findFavicon } from "./favicon.ts";

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
