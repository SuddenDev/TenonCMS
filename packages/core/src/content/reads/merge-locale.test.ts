import { describe, expect, it } from "vitest";
import type { Fields } from "../../schema/index.ts";
import { mergeLocale } from "./merge-locale.ts";

describe("mergeLocale", () => {
  const shared = { hero: "m1", title: "stale" };

  it("takes localized keys from the requested locale", () => {
    expect(mergeLocale(["title"], shared, { title: "Hallo" }, { title: "Hello" })).toEqual({
      hero: "m1",
      title: "Hallo",
    });
  });

  it("falls back to the fallback row, then to null", () => {
    expect(mergeLocale(["title", "body"], shared, {}, { title: "Hello" })).toEqual({
      hero: "m1",
      title: "Hello",
      body: null,
    });
  });

  it("falls back for a stored null", () => {
    expect(mergeLocale(["title"], shared, { title: null }, { title: "Hello" }).title).toBe("Hello");
  });

  it("reads null without a fallback", () => {
    expect(mergeLocale(["title"], shared, undefined, undefined).title).toBeNull();
    expect(mergeLocale(["title"], shared, { title: null }, null).title).toBeNull();
  });

  it("ignores values outside keys in locale rows", () => {
    const out = mergeLocale(["title"], shared, { hero: "stale", title: "Hallo" }, { hero: "x" });
    expect(out.hero).toBe("m1");
  });

  it("keeps falsy values that are not null", () => {
    expect(mergeLocale(["n", "s"], {}, { n: 0, s: "" }, { n: 1, s: "x" })).toEqual({ n: 0, s: "" });
  });

  it("copies shared without mutating it", () => {
    const out = mergeLocale([], shared, { title: "x" }, undefined);
    expect(out).toEqual(shared);
    expect(out).not.toBe(shared);
  });
});

describe("mergeLocale with a shared structure", () => {
  const fields = {
    content: {
      type: "blocks",
      blocks: {
        hero: { fields: { heading: { type: "text" }, image: { type: "text" } } },
        columns: {
          fields: {
            left: { type: "blocks", blocks: { text: { fields: { body: { type: "text" } } } } },
          },
        },
      },
    },
  } satisfies Fields;
  const structure = [
    { id: "a1", blockType: "hero" },
    { id: "a2", blockType: "columns", left: [{ id: "b1", blockType: "text" }] },
  ];
  const en = {
    content: { a1: { heading: "Hello", image: "m1" }, a2: { left: { b1: { body: "Hi" } } } },
  };
  const de = { content: { a1: { heading: "Hallo" } } };
  const opts = (base: Record<string, unknown> | null = en) => ({ fields, syncDefault: true, base });

  it("builds the document from the structure and the values", () => {
    const out = mergeLocale(["content"], { content: structure }, en, null, opts());
    expect(out.content).toEqual([
      { id: "a1", blockType: "hero", heading: "Hello", image: "m1" },
      { id: "a2", blockType: "columns", left: [{ id: "b1", blockType: "text", body: "Hi" }] },
    ]);
    expect(out).toMatchObject({ syncStructure: true, syncStructureDefault: true });
  });

  it("falls back field by field, then to null", () => {
    const out = mergeLocale(["content"], { content: structure }, de, en, opts());
    expect(out.content).toEqual([
      { id: "a1", blockType: "hero", heading: "Hallo", image: "m1" },
      { id: "a2", blockType: "columns", left: [{ id: "b1", blockType: "text", body: "Hi" }] },
    ]);
    const bare = mergeLocale(["content"], { content: structure }, de, null, opts());
    expect((bare.content as any[])[0]).toEqual({
      id: "a1",
      blockType: "hero",
      heading: "Hallo",
      image: null,
    });
    expect((bare.content as any[])[1].left[0].body).toBeNull();
  });

  it("reads a full list in a synced row by item id", () => {
    const full = {
      content: [
        { id: "a1", blockType: "hero", heading: "Hallo" },
        { id: "x", blockType: "hero", heading: "Gone" },
      ],
    };
    const out = mergeLocale(["content"], { content: structure }, full, null, opts());
    expect((out.content as any[]).map((i) => i.id)).toEqual(["a1", "a2"]);
    expect((out.content as any[])[0].heading).toBe("Hallo");
  });

  it("takes the default locale's structure when none is stored", () => {
    const enList = { content: [{ id: "a1", blockType: "hero", heading: "Hello" }] };
    const deList = { content: [{ id: "z", blockType: "hero", heading: "Anders" }] };
    const out = mergeLocale(["content"], {}, deList, null, opts(enList));
    expect(out.content).toEqual([{ id: "a1", blockType: "hero", heading: null, image: null }]);
  });

  it("keeps a separate row's own list when not synced", () => {
    const own = { content: [{ id: "z", blockType: "hero", heading: "Anders" }] };
    const out = mergeLocale(
      ["content"],
      { content: structure, syncStructure: false },
      own,
      en,
      opts(),
    );
    expect(out.content).toEqual([{ id: "z", blockType: "hero", heading: "Anders", image: null }]);
    expect(out).toMatchObject({ syncStructure: false, syncStructureDefault: false });
  });

  it("uses the shared structure and the default values for a separate row that holds values by id", () => {
    const out = mergeLocale(
      ["content"],
      { content: structure, syncStructure: false },
      de,
      null,
      opts(),
    );
    expect((out.content as any[])[0]).toEqual({
      id: "a1",
      blockType: "hero",
      heading: "Hallo",
      image: "m1",
    });
  });

  it("follows the default when the document has no state of its own", () => {
    const own = { content: [{ id: "z", blockType: "hero", heading: "Anders" }] };
    const out = mergeLocale(["content"], { content: structure }, own, null, {
      ...opts(),
      syncDefault: false,
    });
    expect((out.content as any[])[0].id).toBe("z");
    expect(out).toMatchObject({ syncStructure: false, syncStructureDefault: true });
  });

  it("reads null for a list without any value", () => {
    const out = mergeLocale(["content"], {}, null, null, {
      fields,
      syncDefault: false,
      base: null,
    });
    expect(out.content).toBeNull();
  });
});
