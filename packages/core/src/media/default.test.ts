import { chmodSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { defaultMedia } from "./default.ts";

afterEach(() => {
  vi.restoreAllMocks();
});

const readOnlyCwd = () => {
  const dir = mkdtempSync(join(tmpdir(), "tenon-readonly-"));
  chmodSync(dir, 0o555);
  vi.spyOn(process, "cwd").mockReturnValue(dir);
};

// Serverless functions, such as Vercel's, run in a read-only directory.
it("has no media library in a read-only directory", () => {
  readOnlyCwd();
  expect(defaultMedia(false)).toBeUndefined();
});

it("throws for `media: true` in a read-only directory", () => {
  readOnlyCwd();
  expect(() => defaultMedia(true)).toThrow(/s3\(\)/);
});
