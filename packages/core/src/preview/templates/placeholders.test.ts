import { describe, expect, it } from "vitest";
import { placeholders } from "./placeholders.ts";

describe("placeholders", () => {
  it("lists the paths in order", () => {
    expect(placeholders("/{category.slug}/{slug}")).toEqual(["category.slug", "slug"]);
  });

  it("is empty for a plain path", () => {
    expect(placeholders("/")).toEqual([]);
  });
});
