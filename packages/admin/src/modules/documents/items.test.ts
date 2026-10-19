import { describe, expect, it } from "vitest";
import type { ArrayField, BlocksField } from "../../../../core/src/schema";
import { duplicateItem, itemTitle, moveItem, newItem } from "./items";
import { isEmpty, normalize, titleField } from "./fields";

const slides = {
  type: "array",
  fields: {
    title: { type: "text", default: "Untitled" },
    count: { type: "number" },
    meta: { type: "group", fields: { note: { type: "text" } } },
    tags: { type: "array", fields: { name: { type: "text" } } },
  },
} as unknown as ArrayField;

describe("newItem", () => {
  it("has an id, defaults and shaped nested values", () => {
    const item = newItem(slides);

    expect(item.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(item).toMatchObject({ title: "Untitled", count: null, meta: { note: null }, tags: [] });
  });

  it("gives every item its own id", () => {
    expect(newItem(slides).id).not.toBe(newItem(slides).id);
  });
});

const content = {
  type: "blocks",
  blocks: {
    hero: {
      fields: { title: { type: "text", default: "Hi" }, cta: { type: "group", fields: {} } },
    },
    text: { fields: { body: { type: "textarea" } } },
    cols: {
      fields: {
        cols: { type: "blocks", blocks: { text: { fields: { body: { type: "text" } } } } },
      },
    },
  },
} as unknown as BlocksField;

describe("newItem blocks", () => {
  it("has an id, the blockType and the block's defaults", () => {
    const item = newItem(content, "hero");

    expect(item.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(item).toMatchObject({ blockType: "hero", title: "Hi", cta: {} });
    expect(newItem(content, "text")).toMatchObject({ blockType: "text", body: null });
  });
});

describe("blocks items", () => {
  it("duplicateItem renews ids in nested blocks and keeps blockType", () => {
    const item = { id: "1", blockType: "cols", cols: [{ id: "2", blockType: "text", body: "x" }] };
    const copy = duplicateItem(item, content);

    expect(copy.id).not.toBe("1");
    expect(copy.blockType).toBe("cols");
    expect(copy.cols[0].id).not.toBe("2");
    expect(copy.cols[0]).toMatchObject({ blockType: "text", body: "x" });
  });

  it("duplicateItem copies an unknown block as is, with a new id", () => {
    const copy = duplicateItem({ id: "1", blockType: "gone", a: 1 }, content);

    expect(copy).toMatchObject({ blockType: "gone", a: 1 });
    expect(copy.id).not.toBe("1");
  });

  it("itemTitle reads the block's fields", () => {
    expect(itemTitle({ id: "1", blockType: "hero", title: "Welcome" }, content)).toBe("Welcome");
    expect(itemTitle({ id: "1", blockType: "gone", title: "Welcome" }, content)).toBe("");
  });

  it("normalize keeps blockType and unknown blocks, titleField skips blocks", () => {
    const out = normalize({ content } as never, {
      content: [
        { id: "1", blockType: "text", body: "" },
        { id: "2", blockType: "gone", a: { b: 1 } },
      ],
    }) as any;

    expect(out.content).toEqual([
      { id: "1", blockType: "text", body: null },
      { id: "2", blockType: "gone", a: { b: 1 } },
    ]);
    expect(titleField({ fields: { content, name: { type: "text" } } } as never)).toBe("name");
  });

  it("normalize defaults a many select to an empty list", () => {
    const fields = { tags: { type: "select", many: true, options: ["a"] } };

    expect(normalize(fields as never, {})).toEqual({ tags: [] });
  });
});

describe("moveItem", () => {
  it("moves up and down without changing the input", () => {
    const list = ["a", "b", "c"];

    expect(moveItem(list, 2, 0)).toEqual(["c", "a", "b"]);
    expect(moveItem(list, 0, 1)).toEqual(["b", "a", "c"]);
    expect(list).toEqual(["a", "b", "c"]);
  });

  it("ignores positions outside the list", () => {
    expect(moveItem(["a", "b"], 0, 2)).toEqual(["a", "b"]);
    expect(moveItem(["a", "b"], 0, -1)).toEqual(["a", "b"]);
    expect(moveItem(["a", "b"], 5, 0)).toEqual(["a", "b"]);
  });
});

describe("duplicateItem", () => {
  it("renews ids at every depth and keeps the values", () => {
    const item = { id: "1", title: "A", meta: { note: "n" }, tags: [{ id: "2", name: "x" }] };
    const copy = duplicateItem(item, slides);

    expect(copy.id).not.toBe("1");
    expect(copy.tags[0].id).not.toBe("2");
    expect(copy).toMatchObject({ title: "A", meta: { note: "n" }, tags: [{ name: "x" }] });
    expect(item.tags[0].id).toBe("2");
  });
});

describe("itemTitle", () => {
  it("is the first non-empty text value", () => {
    const fields = {
      type: "array",
      fields: { n: { type: "number" }, a: { type: "text" }, b: { type: "textarea" } },
    } as never;

    expect(itemTitle({ id: "1", n: 3, a: " ", b: "Hi" }, fields)).toBe("Hi");
    expect(itemTitle({ id: "1", n: 3 }, fields)).toBe("");
  });
});

describe("fields", () => {
  it("titleField skips arrays", () => {
    expect(titleField({ fields: { list: slides, name: { type: "text" } } } as never)).toBe("name");
  });

  it("isEmpty treats [] as empty", () => {
    expect(isEmpty([])).toBe(true);
    expect(isEmpty([{ id: "1" }])).toBe(false);
  });

  it("normalize keeps ids, shapes items and nulls inactive fields on save", () => {
    const fields = {
      list: {
        type: "array",
        fields: {
          kind: { type: "text" },
          extra: { type: "text", condition: { kind: "x" } },
        },
      },
    } as never;

    expect(normalize(fields, undefined)).toEqual({ list: [] });
    expect(normalize(fields, { list: null })).toEqual({ list: [] });

    const out = normalize(fields, { list: [{ id: "1", kind: "y", extra: "e" }] }, true) as any;

    expect(out.list).toEqual([{ id: "1", kind: "y", extra: null }]);
  });
});

it("fills rich text defaults from the reactive admin schema", async () => {
  const { reactive } = await import("vue");
  const fields = reactive({
    body: {
      type: "richtext" as const,
      default: {
        type: "doc" as const,
        content: [{ type: "paragraph", content: [{ type: "text", text: "Start here" }] }],
      },
    },
  });

  expect(normalize(fields, {}, false, true).body).toEqual(fields.body.default);
});
