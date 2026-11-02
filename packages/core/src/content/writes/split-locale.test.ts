import { describe, expect, it } from "vitest";
import type { Fields } from "../../schema/index.ts";
import { splitLocale } from "./split-locale.ts";

describe("splitLocale", () => {
  it("moves localized keys out of the shared data", () => {
    expect(splitLocale(["title", "seo"], { title: "A", hero: "m1", seo: { x: 1 } })).toEqual({
      shared: { hero: "m1" },
      localized: { title: "A", seo: { x: 1 } },
    });
  });

  it("returns an empty localized object when no key is present", () => {
    expect(splitLocale(["title"], { hero: "m1" })).toEqual({
      shared: { hero: "m1" },
      localized: {},
    });
  });

  it("keeps null values of localized keys", () => {
    expect(splitLocale(["title"], { title: null }).localized).toEqual({ title: null });
  });

  it("keeps everything shared for an unlocalized entry", () => {
    const data = { title: "A", hero: "m1" };
    expect(splitLocale([], data)).toEqual({ shared: data, localized: {} });
  });
});

describe("splitLocale with a shared structure", () => {
  const fields = {
    content: {
      type: "blocks",
      blocks: {
        hero: { fields: { heading: { type: "text" } } },
        columns: {
          fields: {
            left: { type: "blocks", blocks: { text: { fields: { body: { type: "text" } } } } },
          },
        },
      },
    },
    nav: {
      type: "group",
      fields: {
        label: { type: "text" },
        items: { type: "array", fields: { a: { type: "text" } } },
      },
    },
  } satisfies Fields;
  const data = {
    title: "About",
    content: [
      { id: "a1", blockType: "hero", heading: "Hello" },
      { id: "a2", blockType: "columns", left: [{ id: "b1", blockType: "text", body: "Hi" }] },
    ],
    nav: { label: "Menu", items: [{ id: "n1", a: "x" }] },
  };

  it("moves the structure to the shared data and the values by id to the locale", () => {
    expect(splitLocale(["title", "content", "nav"], data, { fields, synced: true })).toEqual({
      shared: {
        content: [
          { id: "a1", blockType: "hero" },
          { id: "a2", blockType: "columns", left: [{ id: "b1", blockType: "text" }] },
        ],
        nav: { items: [{ id: "n1" }] },
      },
      localized: {
        title: "About",
        content: { a1: { heading: "Hello" }, a2: { left: { b1: { body: "Hi" } } } },
        nav: { label: "Menu", items: { n1: { a: "x" } } },
      },
    });
  });

  it("drops values of removed items", () => {
    const { localized } = splitLocale(
      ["content"],
      { content: [data.content[0]] },
      { fields, synced: true },
    );
    expect(localized.content).toEqual({ a1: { heading: "Hello" } });
  });

  it("gives the same shared data for an unchanged structure", () => {
    const de = { ...data, content: [{ ...data.content[0], heading: "Hallo" }, data.content[1]] };
    const a = splitLocale(["content", "nav"], data, { fields, synced: true }).shared;
    const b = splitLocale(["content", "nav"], de, { fields, synced: true }).shared;
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("keeps full lists when not synced", () => {
    const { shared, localized } = splitLocale(
      ["content"],
      { content: data.content },
      { fields, synced: false },
    );
    expect(shared).toEqual({});
    expect(localized.content).toEqual(data.content);
  });
});
