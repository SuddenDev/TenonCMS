import { describe, expect, it } from "vitest";
import type { Fields } from "../index.ts";
import { pathKey, relationPaths } from "./relation-paths.ts";

const fields = {
  author: { type: "relation", collection: "authors" },
  seo: { type: "group", fields: { image: { type: "image" } } },
  links: {
    type: "array",
    fields: {
      page: { type: "relation", collection: "pages" },
      tags: {
        type: "array",
        fields: { tag: { type: "relation", collection: "tags", many: true } },
      },
    },
  },
  meta: {
    type: "group",
    fields: { files: { type: "array", fields: { file: { type: "file" } } } },
  },
} satisfies Fields;

describe("relationPaths", () => {
  it("walks groups, arrays, nested arrays and arrays in groups", () => {
    expect(relationPaths(fields).map((r) => [r.path, r.field])).toEqual([
      [["author"], fields.author],
      [["seo", "image"], fields.seo.fields.image],
      [["links", { each: true }, "page"], fields.links.fields.page],
      [
        ["links", { each: true }, "tags", { each: true }, "tag"],
        fields.links.fields.tags.fields.tag,
      ],
      [["meta", "files", { each: true }, "file"], fields.meta.fields.files.fields.file],
    ]);
  });
});

describe("relationPaths with blocks", () => {
  it("returns one path per block", () => {
    const blocks = {
      content: {
        type: "blocks",
        blocks: {
          hero: { fields: { image: { type: "image" }, title: { type: "text" } } },
          text: { fields: { body: { type: "text" } } },
          card: {
            fields: {
              links: { type: "array", fields: { page: { type: "relation", collection: "pages" } } },
            },
          },
        },
      },
    } satisfies Fields;
    expect(relationPaths(blocks).map((r) => [r.path, r.field])).toEqual([
      [
        ["content", { each: true, blockType: "hero" }, "image"],
        blocks.content.blocks.hero.fields.image,
      ],
      [
        ["content", { each: true, blockType: "card" }, "links", { each: true }, "page"],
        blocks.content.blocks.card.fields.links.fields.page,
      ],
    ]);
  });
});

describe("pathKey", () => {
  it("renders keys with dots and items with brackets", () => {
    expect(pathKey(["seo", "image"])).toBe("seo.image");
    expect(pathKey(["links", { each: true }, "page"])).toBe("links[].page");
    expect(pathKey(["a", { each: true }, "b", { each: true }, "c"])).toBe("a[].b[].c");
    expect(pathKey(["content", { each: true, blockType: "hero" }, "image"])).toBe(
      "content[hero].image",
    );
  });
});
