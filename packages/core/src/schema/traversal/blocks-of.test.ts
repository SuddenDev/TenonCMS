import { describe, expect, it } from "vitest";
import type { Block, BlocksField, Fields } from "../index.ts";
import { nestsItself, unseenBlocks } from "./blocks-of.ts";

const leaf: Block = { fields: { body: { type: "text" } } };
const loop: Block = { fields: {} };
loop.fields.children = { type: "blocks", blocks: { loop, leaf } };

describe("nestsItself", () => {
  it("finds a block inside itself, also inside groups and arrays", () => {
    expect(nestsItself({ a: { type: "blocks", blocks: { leaf } } })).toBe(false);
    expect(nestsItself({ a: { type: "blocks", blocks: { leaf, loop } } })).toBe(true);
    const deep: Fields = {
      g: { type: "group", fields: { l: { type: "array", fields: loop.fields } } },
    };
    expect(nestsItself(deep)).toBe(true);
  });

  it("is false for the same block in two places", () => {
    const f = { type: "blocks", blocks: { leaf } } as const;
    expect(nestsItself({ a: f, b: f, c: { type: "blocks", blocks: { x: leaf, y: leaf } } })).toBe(
      false,
    );
  });
});

describe("unseenBlocks", () => {
  it("returns each block once per set", () => {
    const seen = new Set<Block>();
    const f = loop.fields.children as BlocksField;
    expect(unseenBlocks(f, seen).map(([k]) => k)).toEqual(["loop", "leaf"]);
    expect(unseenBlocks(f, seen)).toEqual([]);
  });
});
