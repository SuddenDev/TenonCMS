import { describe, expect, it } from "vitest";
import type { Fields } from "../index.ts";
import { structureFields, localizedKeys } from "./localized-fields.ts";

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

describe("structureFields", () => {
  const listed = {
    title: { type: "text" },
    links: { type: "array", fields: { label: { type: "text" } } },
    content: { type: "blocks", blocks: { text: { fields: { body: { type: "text" } } } } },
    nav: { type: "group", fields: { items: { type: "array", fields: { a: { type: "text" } } } } },
    seo: { type: "group", fields: { description: { type: "text" } } },
    shared: { type: "array", localized: false, fields: { a: { type: "text" } } },
  } satisfies Fields;

  it("lists localized top-level lists and groups that hold lists", () => {
    expect(Object.keys(structureFields({ localized: true, fields: listed }))).toEqual([
      "links",
      "content",
      "nav",
    ]);
  });

  it("is empty for an unlocalized entry", () => {
    expect(structureFields({ fields: listed })).toEqual({});
  });
});
