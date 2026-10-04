import { describe, expect, it } from "vitest";
import { edit } from "./bind-elements.ts";

describe("edit", () => {
  it("joins collection, id and path", () => {
    expect(edit("pages", "abc", "seo.title")).toBe("pages:abc:seo.title");
  });

  it("leaves the id empty for a global", () => {
    expect(edit("general", null, "title")).toBe("general::title");
  });
});
