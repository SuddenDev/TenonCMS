import { describe, expect, it } from "vitest";
import { ago, formatDateTime } from "./utils";

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

describe("formatDateTime", () => {
  it("shows the instant in the given time zone", () => {
    const at = "2027-01-05T09:00:00Z";
    expect(formatDateTime(at, "en", "UTC")).toBe("Jan 5, 2027, 9:00 AM");
    expect(formatDateTime(at, "en", "Asia/Tokyo")).toBe("Jan 5, 2027, 6:00 PM");
  });
});
