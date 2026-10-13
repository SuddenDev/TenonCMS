import { describe, expect, it } from "vitest";
import type { Fields } from "../index.ts";
import { eachField } from "./each-field.ts";

const fields = {
  title: { type: "text" },
  links: {
    type: "array",
    fields: {
      label: { type: "text" },
      tags: { type: "array", fields: { name: { type: "text" } } },
    },
  },
  seo: {
    type: "group",
    fields: { alternates: { type: "array", fields: { href: { type: "text" } } } },
  },
} satisfies Fields;

async function visited(data: Record<string, any>, skip?: string) {
  const seen: [string, unknown][] = [];
  await eachField(fields, data, (_key, _field, siblings, path) => {
    seen.push([path, siblings]);
    if (path === skip) return false;
  });
  return seen;
}

describe("eachField", () => {
  it("visits item fields with positional paths and the item as siblings", async () => {
    const a = { id: "a", label: "A" };
    const b = { id: "b", label: "B" };
    const seen = await visited({ links: [a, b] });
    expect(seen.map(([p]) => p)).toEqual([
      "title",
      "links",
      "links.0.label",
      "links.0.tags",
      "links.1.label",
      "links.1.tags",
      "seo",
    ]);
    expect(seen[2]![1]).toBe(a);
    expect(seen[4]![1]).toBe(b);
  });

  it("skips the items when the visit returns false", async () => {
    const seen = await visited({ links: [{ label: "A" }] }, "links");
    expect(seen.map(([p]) => p)).toEqual(["title", "links", "seo"]);
  });

  it("skips a value that is not an array and items that are not objects", async () => {
    expect((await visited({ links: { label: "A" } })).map(([p]) => p)).toEqual([
      "title",
      "links",
      "seo",
    ]);
    expect((await visited({ links: [null, "x", [], { label: "A" }] })).map(([p]) => p)).toEqual([
      "title",
      "links",
      "links.3.label",
      "links.3.tags",
      "seo",
    ]);
  });

  it("walks nested arrays and arrays inside groups", async () => {
    const seen = await visited({
      links: [{ tags: [{ name: "x" }] }],
      seo: { alternates: [{ href: "/de" }] },
    });
    expect(seen.map(([p]) => p)).toEqual([
      "title",
      "links",
      "links.0.label",
      "links.0.tags",
      "links.0.tags.0.name",
      "seo",
      "seo.alternates",
      "seo.alternates.0.href",
    ]);
  });
});

describe("eachField with blocks", () => {
  it("walks each item with its block's fields and skips unknown blocks", async () => {
    const blocks = {
      content: {
        type: "blocks",
        blocks: {
          hero: { fields: { title: { type: "text" } } },
          text: { fields: { body: { type: "text" } } },
        },
      },
    } satisfies Fields;
    const seen: string[] = [];
    await eachField(
      blocks,
      { content: [{ blockType: "text" }, { blockType: "nope" }, { blockType: "hero" }] },
      (_k, _f, _s, path) => void seen.push(path),
    );
    expect(seen).toEqual(["content", "content.0.body", "content.2.title"]);
  });
});
