import { describe, expect, it } from "vitest";
import { formatSize } from "./media";

describe("formatSize", () => {
  it("formats the number in the given language", () => {
    expect(formatSize(500, "en")).toBe("500 B");
    expect(formatSize(1536, "en")).toBe("1.5 KB");
    expect(formatSize(1536, "de")).toBe("1,5 KB");
    expect(formatSize(12 * 1024 ** 2, "de")).toBe("12 MB");
  });
});
