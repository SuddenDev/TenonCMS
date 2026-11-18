import { describe, expect, it } from "vitest";
import { regenerateReport } from "./media.command.ts";

describe("regenerateReport", () => {
  it("counts rendered and removed variants", () => {
    expect(regenerateReport({ rendered: 3, removed: 1 })).toEqual({
      done: "Rendered 3 variants, removed 1",
    });
  });

  it("points to the admin for missing previews without an image provider", () => {
    const report = regenerateReport({ rendered: 0, removed: 2, needsThumbnail: 4 });
    expect(report.done).toBe("Removed 2 variants");
    expect(report.previews).toContain("4 images have no preview");
    expect(regenerateReport({ rendered: 0, removed: 0, needsThumbnail: 0 })).toEqual({
      done: "Nothing to do",
    });
  });
});
