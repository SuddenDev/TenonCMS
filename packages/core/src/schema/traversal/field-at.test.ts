import { describe, expect, it } from "vitest";
import type { Fields } from "../index.ts";
import { fieldAt } from "./field-at.ts";
import { filterable } from "./filterable.ts";

const fields = {
  links: {
    type: "array",
    fields: {
      label: { type: "text" },
      tags: { type: "array", fields: { name: { type: "text" } } },
      meta: { type: "group", fields: { note: { type: "text" } } },
    },
  },
} satisfies Fields;

describe("fieldAt", () => {
  it("steps into an array's fields after an index", () => {
    expect(fieldAt(fields, "links.2.label")).toBe(fields.links.fields.label);
    expect(fieldAt(fields, "links.0.tags.1.name")).toBe(fields.links.fields.tags.fields.name);
    expect(fieldAt(fields, "links.0.meta.note")).toBe(fields.links.fields.meta.fields.note);
  });

  it("needs a non-negative integer index after an array", () => {
    expect(fieldAt(fields, "links.label")).toBeUndefined();
    expect(fieldAt(fields, "links.-1.label")).toBeUndefined();
    expect(fieldAt(fields, "links.1.5.label")).toBeUndefined();
    expect(fieldAt(fields, "links.0")).toBeUndefined();
  });
});

describe("fieldAt with blocks", () => {
  const blocks = {
    content: {
      type: "blocks",
      blocks: {
        hero: { fields: { title: { type: "text" } } },
        text: {
          fields: {
            body: { type: "text" },
            notes: {
              type: "blocks",
              blocks: { note: { fields: { text: { type: "text" } } } },
            },
          },
        },
      },
    },
  } satisfies Fields;
  const data = {
    content: [
      { blockType: "hero", title: "Hi" },
      { blockType: "text", notes: [{ blockType: "note" }] },
      { blockType: "nope" },
    ],
  };

  it("reads the block type of the item from data", () => {
    expect(fieldAt(blocks, "content.0.title", data)).toBe(blocks.content.blocks.hero.fields.title);
    expect(fieldAt(blocks, "content.1.body", data)).toBe(blocks.content.blocks.text.fields.body);
    expect(fieldAt(blocks, "content.1.notes.0.text", data)).toBe(
      blocks.content.blocks.text.fields.notes.blocks.note.fields.text,
    );
  });

  it("finds nothing without data, for a missing item or an unknown block", () => {
    expect(fieldAt(blocks, "content.0.title")).toBeUndefined();
    expect(fieldAt(blocks, "content.0.body", data)).toBeUndefined();
    expect(fieldAt(blocks, "content.2.title", data)).toBeUndefined();
    expect(fieldAt(blocks, "content.5.title", data)).toBeUndefined();
    expect(fieldAt(blocks, "content.0", data)).toBeUndefined();
  });

  it("walks data through groups and arrays", () => {
    const nested = {
      g: { type: "group", fields: { list: { type: "array", fields: blocks } } },
    } satisfies Fields;
    const d = { g: { list: [{}, { content: [{ blockType: "hero" }] }] } };
    expect(fieldAt(nested, "g.list.1.content.0.title", d)).toBe(
      blocks.content.blocks.hero.fields.title,
    );
  });
});

describe("filterable", () => {
  it("rejects arrays and blocks", () => {
    expect(filterable(fields, "links")).toBe(false);
    expect(filterable({ c: { type: "blocks", blocks: {} } }, "c")).toBe(false);
  });
});
