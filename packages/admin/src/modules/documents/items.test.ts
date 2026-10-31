import { describe, expect, it } from "vitest";
import type { ArrayField, BlocksField } from "../../../../core/src/schema";
import { blocksOf } from "../../../../core/src/schema/traversal/blocks-of";
import {
  blockOf,
  canHold,
  duplicateItem,
  hasErrorsAt,
  insertItemAt,
  itemChain,
  removeItemAt,
  itemTitle,
  moveItem,
  moveItemTo,
  nestedLists,
  newItem,
  treeRow,
} from "./items";
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

describe("moveItemTo", () => {
  const tree = () => [
    { id: "a", blockType: "text" },
    { id: "c", blockType: "cols", cols: [{ id: "x", blockType: "text" }] },
    { id: "b", blockType: "text" },
  ];
  const ids = (list: { id: string }[]) => list.map((i) => i.id);

  it("moves within one list, before the given position", () => {
    const list = tree();
    moveItemTo(list, "0", "", 3);
    expect(ids(list)).toEqual(["c", "b", "a"]);

    moveItemTo(list, "2", "", 0);
    expect(ids(list)).toEqual(["a", "c", "b"]);
  });

  it("moves into a nested list that sits after the item", () => {
    const list = tree();
    moveItemTo(list, "0", "1.cols", 0);

    expect(ids(list)).toEqual(["c", "b"]);
    expect(ids(list[0].cols!)).toEqual(["a", "x"]);
  });

  it("moves out of a nested list", () => {
    const list = tree();
    moveItemTo(list, "1.cols.0", "", 2);

    expect(ids(list)).toEqual(["a", "c", "x", "b"]);
    expect(list[1].cols).toEqual([]);
  });
});

describe("canHold", () => {
  const text = { fields: { body: { type: "text" } } };
  const a = { type: "blocks", blocks: { text } } as unknown as BlocksField;
  const b = { type: "blocks", blocks: { text, other: text } } as unknown as BlocksField;
  const c = {
    type: "blocks",
    blocks: { text: { fields: {} } },
  } as unknown as BlocksField;

  it("takes a block item when the list has the same block under the same key", () => {
    expect(canHold(b, a, { id: "1", blockType: "text" })).toBe(true);
    expect(canHold(c, a, { id: "1", blockType: "text" })).toBe(false);
    expect(canHold(a, b, { id: "1", blockType: "other" })).toBe(false);
  });

  it("takes an array item only into the same field", () => {
    expect(canHold(slides, slides, { id: "1" })).toBe(true);
    expect(canHold({ ...slides }, slides, { id: "1" })).toBe(false);
    expect(canHold(a, slides, { id: "1" })).toBe(false);
  });
});

describe("blockOf", () => {
  it("is the block of a block item, undefined for an unknown block or an array", () => {
    expect(blockOf(content, { id: "1", blockType: "text" })).toBe(blocksOf(content).text);
    expect(blockOf(content, { id: "1", blockType: "toString" })).toBeUndefined();
    expect(blockOf(slides, { id: "1" })).toBeUndefined();
  });
});

describe("nestedLists", () => {
  it("finds the lists of an item, also inside groups", () => {
    const item = newItem(slides);
    item.meta = { tags: [] };
    const field = {
      type: "array",
      fields: { ...slides.fields, meta: { type: "group", fields: { tags: slides.fields.tags } } },
    } as unknown as ArrayField;

    expect(nestedLists(field, item, "list.0").map((l) => [l.key, l.path])).toEqual([
      ["tags", "list.0.meta.tags"],
      ["tags", "list.0.tags"],
    ]);
  });

  it("is empty for an unknown block", () => {
    expect(nestedLists(content, { id: "1", blockType: "gone" }, "c.0")).toEqual([]);
  });
});

const menu = {
  type: "blocks",
  blocks: {
    link: {
      label: "Link",
      fields: {
        label: { type: "text" },
        link: { type: "link" },
        children: { type: "blocks", blocks: {} },
      },
    },
  },
} as unknown as BlocksField;
blocksOf(blocksOf(menu).link.fields.children as BlocksField).link = blocksOf(menu).link;

describe("treeRow", () => {
  const about = { collection: "pages", id: "a" };
  const resolve = (r: { id: string }) =>
    r.id === "a" ? { href: "/about", title: "About" } : { href: null, broken: true as const };

  it("uses the first text value and the link's path with its collection", () => {
    expect(
      treeRow(
        { id: "1", blockType: "link", label: "Home", link: { reference: about } },
        menu,
        resolve,
      ),
    ).toEqual({ title: "Home", fromLink: false, line: "/about", collection: "pages" });
  });

  it("falls back to the link's title", () => {
    expect(
      treeRow({ id: "1", blockType: "link", link: { reference: about } }, menu, resolve),
    ).toEqual({
      title: "About",
      fromLink: true,
      line: "/about",
      collection: "pages",
    });
  });

  it("shows the host of an external link and nothing for an empty item", () => {
    expect(
      treeRow(
        { id: "1", blockType: "link", link: { href: "https://example.com/x" } },
        menu,
        resolve,
      ),
    ).toEqual({ title: "", fromLink: false, line: "example.com" });
    expect(treeRow({ id: "1", blockType: "link" }, menu, resolve)).toEqual({
      title: "",
      fromLink: false,
    });
  });
});

describe("hasErrorsAt", () => {
  const errors = { "items.0.children.2.link": "Invalid link" };

  it("marks the row with the error and each ancestor row", () => {
    expect(hasErrorsAt(errors, "items.0.children.2")).toBe(true);
    expect(hasErrorsAt(errors, "items.0")).toBe(true);
    expect(hasErrorsAt(errors, "items.0.children.1")).toBe(false);
    expect(hasErrorsAt(errors, "items.1")).toBe(false);
  });
});

describe("itemChain", () => {
  it("lists the items from the top down to the one that holds a path", () => {
    const deep = { id: "c", blockType: "link", children: [] };
    const top = {
      id: "a",
      blockType: "link",
      children: [{ id: "b", blockType: "link", children: [deep] }],
    };
    const items = [{ id: "x", blockType: "link", children: [] }, top];

    expect(
      itemChain(menu, items, "items", "items.1.children.0.children.0.label").map((i) => i.path),
    ).toEqual(["items.1", "items.1.children.0", "items.1.children.0.children.0"]);
    expect(itemChain(menu, items, "items", "items.1.children.0").map((i) => i.item.id)).toEqual([
      "a",
      "b",
    ]);
    expect(itemChain(menu, items, "items", "other.0")).toEqual([]);
  });
});

describe("insertItemAt and removeItemAt", () => {
  it("change nested lists in place by path", () => {
    const list = [
      { id: "a", children: [{ id: "b" }] },
      { id: "c", children: [] },
    ];

    insertItemAt(list, "0.children", { id: "x" });
    insertItemAt(list, "", { id: "y" }, 1);

    expect(list.map((i) => i.id)).toEqual(["a", "y", "c"]);
    expect(list[0].children.map((i: { id: string }) => i.id)).toEqual(["b", "x"]);
    expect(removeItemAt(list, "0.children.0")).toEqual({ id: "b" });
    expect(removeItemAt(list, "1")).toEqual({ id: "y" });
    expect(list).toEqual([
      { id: "a", children: [{ id: "x" }] },
      { id: "c", children: [] },
    ]);
  });
});
