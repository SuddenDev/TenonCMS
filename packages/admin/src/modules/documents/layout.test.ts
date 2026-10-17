import { describe, expect, it } from "vitest";
import { layout } from "./layout";

const text = (o: object = {}) => ({ type: "text", ...o }) as const;
const names = (
  sections: { fieldset?: string; container?: boolean; fields: [string, unknown][] }[],
) => sections.map((s) => ({ ...s, fields: s.fields.map(([n]) => n) }));

describe("layout", () => {
  it("puts fields without a tab above the tabs and shows a field in each of its tabs", () => {
    const fields = {
      title: text(),
      body: text({ tab: "content" }),
      meta: text({ tab: ["content", "seo"] }),
      ref: { type: "join", collection: "c", on: "x" },
    };
    const out = layout(fields as never, { tabs: { content: {}, seo: {}, empty: {} } });
    expect(names(out.head)).toEqual([{ fields: ["title"] }]);
    expect(out.tabs.map((t) => [t.key, names(t.sections)])).toEqual([
      ["content", [{ fields: ["body", "meta"] }]],
      ["seo", [{ fields: ["meta"] }]],
      ["empty", []],
    ]);
  });

  it("places a fieldset at its first field and collects all of its fields", () => {
    const fields = {
      a: text(),
      b: text({ fieldset: "box" }),
      c: text(),
      d: text({ fieldset: "box" }),
      e: text(),
    };
    expect(names(layout(fields as never, { fieldsets: { box: {} } }).head)).toEqual([
      { fields: ["a"] },
      { fieldset: "box", fields: ["b", "d"] },
      { fields: ["c", "e"] },
    ]);
  });

  it("gives groups and lists outside a fieldset a section of their own when split", () => {
    const fields = {
      a: text(),
      g: { type: "group", fields: {} },
      b: text(),
      l: { type: "array", fields: {}, fieldset: "box" },
    };
    const out = layout(fields as never, { fieldsets: { box: {} } }, true);
    expect(names(out.head)).toEqual([
      { fields: ["a"] },
      { container: true, fields: ["g"] },
      { fields: ["b"] },
      { fieldset: "box", fields: ["l"] },
    ]);
  });
});
