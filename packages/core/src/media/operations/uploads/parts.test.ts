import { describe, expect, it } from "vitest";
import { effectivePartSize } from "./parts.ts";

describe("effectivePartSize", () => {
  it("keeps the part size while there are at most 10000 parts", () => {
    expect(effectivePartSize(1000, 100)).toBe(100);
    expect(effectivePartSize(1_000_000, 100)).toBe(100);
  });

  it("raises it above 10000 parts", () => {
    expect(effectivePartSize(1_000_001, 100)).toBe(101);
    expect(Math.ceil((5 * 1024 ** 3) / effectivePartSize(5 * 1024 ** 3, 1024))).toBeLessThanOrEqual(
      10_000,
    );
  });
});
