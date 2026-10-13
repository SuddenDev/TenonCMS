import { describe, expect, it } from "vitest";
import type { Fields } from "../index.ts";
import { localizedKeys } from "./localized-fields.ts";

const fields = {
  title: { type: "text" },
  hero: { type: "image", localized: false },
  seo: { type: "group", fields: { description: { type: "text" } } },
  shared: { type: "group", localized: false, fields: { a: { type: "text" } } },
  posts: { type: "join", collection: "posts", on: "author" },
} satisfies Fields;

describe("localizedKeys", () => {
  it("lists every top-level field of a localized entry", () => {
    expect(localizedKeys({ localized: true, fields })).toEqual(["title", "seo"]);
  });

  it("is empty for an unlocalized entry", () => {
    expect(localizedKeys({ fields })).toEqual([]);
    expect(localizedKeys({ localized: false, fields })).toEqual([]);
  });
});
