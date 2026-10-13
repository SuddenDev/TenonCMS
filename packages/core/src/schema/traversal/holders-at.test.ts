import { describe, expect, it } from "vitest";
import { holdersAt } from "./holders-at.ts";

const each = { each: true } as const;

describe("holdersAt", () => {
  it("returns the object that holds a top-level or group key", () => {
    const data = { a: "x", seo: { image: "i" } };
    expect(holdersAt(data, ["a"])).toEqual([{ parent: data, key: "a", at: "a" }]);
    expect(holdersAt(data, ["seo", "image"])).toEqual([
      { parent: data.seo, key: "image", at: "seo.image" },
    ]);
  });

  it("returns one holder per item, with a positional path", () => {
    const links = [{ page: "p1" }, { page: "p2" }, { label: "no page" }];
    expect(holdersAt({ links }, ["links", each, "page"])).toEqual([
      { parent: links[0], key: "page", at: "links.0.page" },
      { parent: links[1], key: "page", at: "links.1.page" },
      { parent: links[2], key: "page", at: "links.2.page" },
    ]);
  });

  it("expands nested arrays", () => {
    const data = { a: [{ b: [{ c: 1 }, { c: 2 }] }, { b: [] }, { b: [{ c: 3 }] }] };
    expect(holdersAt(data, ["a", each, "b", each, "c"]).map((h) => h.at)).toEqual([
      "a.0.b.0.c",
      "a.0.b.1.c",
      "a.2.b.0.c",
    ]);
  });

  it("skips missing and null values and items that are not objects", () => {
    const path = ["links", each, "meta", "page"];
    expect(holdersAt({}, path)).toEqual([]);
    expect(holdersAt({ links: null }, path)).toEqual([]);
    expect(holdersAt({ links: "x" }, path)).toEqual([]);
    expect(holdersAt({ links: [null, 1, "x", [], { meta: null }, {}] }, path)).toEqual([]);
    expect(holdersAt(null, ["a"])).toEqual([]);
  });

  it("keeps only items of the step's block type", () => {
    const content = [{ blockType: "hero", image: "i1" }, { blockType: "text" }];
    expect(holdersAt({ content }, ["content", { each: true, blockType: "hero" }, "image"])).toEqual(
      [{ parent: content[0], key: "image", at: "content.0.image" }],
    );
  });

  it("lets edits through parent[key] land in the data", () => {
    const data = { links: [{ page: "p1" }, { page: "p2" }] };
    for (const { parent, key } of holdersAt(data, ["links", each, "page"])) parent[key] = null;
    expect(data).toEqual({ links: [{ page: null }, { page: null }] });
  });
});
