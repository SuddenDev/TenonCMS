import { describe, expect, it } from "vitest";
import type { Block, BlocksField, Schema } from "../index.ts";
import { blocksOf } from "../traversal/blocks-of.ts";
import { linkBlocks } from "./link-blocks.ts";

const text: Block = { fields: { body: { type: "text" } } };
const schema = (): Schema => ({
  blocks: {
    text,
    section: {
      fields: { children: { type: "blocks", blocks: { section: "section", t: "text" } } },
    },
  },
  collections: {
    pages: { fields: { content: { type: "blocks", blocks: { section: "section", hero: text } } } },
  },
});

describe("linkBlocks", () => {
  it("links names to one shared object, so a block can contain itself", () => {
    const linked = linkBlocks(schema());
    const section = linked.blocks!.section;
    const content = blocksOf(linked.collections!.pages.fields.content as BlocksField);
    const children = blocksOf(section.fields.children as BlocksField);
    expect(content.section).toBe(section);
    expect(children.section).toBe(section);
    expect(children.t).toBe(linked.blocks!.text);
  });

  it("copies containers and keeps the input and other fields", () => {
    const input = schema();
    const before = JSON.stringify(input);
    const linked = linkBlocks(input);
    expect(JSON.stringify(input)).toBe(before);
    const hero = blocksOf(linked.collections!.pages.fields.content as BlocksField).hero;
    expect(hero).not.toBe(text);
    expect(hero.fields.body).toBe(text.fields.body);
  });

  it("links a list of names to the shared blocks under the same keys", () => {
    const linked = linkBlocks({
      blocks: { text },
      collections: { pages: { fields: { c: { type: "blocks", blocks: ["text"] } } } },
    });
    const c = blocksOf(linked.collections!.pages.fields.c as BlocksField);
    expect(Object.keys(c)).toEqual(["text"]);
    expect(c.text).toBe(linked.blocks!.text);
  });

  it("throws for an unknown name in a list", () => {
    expect(() =>
      linkBlocks({
        collections: { pages: { fields: { c: { type: "blocks", blocks: ["nope"] } } } },
      }),
    ).toThrow('blocks "pages.c.nope" names an unknown shared block "nope"');
  });

  it("throws for an unknown name", () => {
    expect(() =>
      linkBlocks({
        globals: { site: { fields: { x: { type: "blocks", blocks: { a: "nope" } } } } },
      }),
    ).toThrow('blocks "site.x.a" names an unknown shared block "nope"');
  });
});
