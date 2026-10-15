import { describe, expect, it } from "vitest";
import { ago } from "./utils";

describe("ago", () => {
  it("formats in the given language", () => {
    const twoHours = Date.now() - 2 * 36e5;
    expect(ago(twoHours, "en")).toBe("2 hours ago");
    expect(ago(twoHours, "de")).toBe("vor 2 Stunden");
  });

  it("says now below a minute", () => {
    expect(ago(Date.now(), "en")).toBe("now");
    expect(ago(Date.now() - 5000, "de")).toBe("jetzt");
  });
});
