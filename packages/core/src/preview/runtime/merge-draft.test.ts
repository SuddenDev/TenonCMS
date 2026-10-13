import { describe, expect, it } from "vitest";
import { merge } from "./merge-draft.ts";

describe("merge", () => {
  const doc = { id: "1", title: "Old", body: "B", author: { id: "a1", name: "Ann" } };

  it("replaces top-level keys with the draft of the document", () => {
    expect(merge("posts", doc, { "posts:1": { title: "New" } })).toEqual({ ...doc, title: "New" });
  });

  it("returns the document without a draft", () => {
    expect(merge("posts", doc, { "posts:2": { title: "New" } })).toBe(doc);
    expect(merge("pages", doc, { "posts:1": { title: "New" } })).toBe(doc);
  });

  it("keeps a populated value whose ids did not change", () => {
    const tags = [{ id: "t1" }, { id: "t2" }];
    const merged = merge(
      "posts",
      { ...doc, tags },
      { "posts:1": { author: "a1", tags: ["t1", "t2"] } },
    );
    expect(merged.author).toBe(doc.author);
    expect(merged.tags).toBe(tags);
  });

  it("takes ids that differ", () => {
    const tags = [{ id: "t1" }, { id: "t2" }];
    const merged = merge("posts", { ...doc, tags }, { "posts:1": { author: "a2", tags: ["t2"] } });
    expect(merged.author).toBe("a2");
    expect(merged.tags).toEqual(["t2"]);
  });

  describe("with items", () => {
    const a = { id: "i1", blockType: "hero", title: "A", image: { id: "m1", url: "/a.png" } };
    const b = { id: "i2", blockType: "text", body: "B", tags: [{ id: "t1" }, { id: "t2" }] };
    const page = { ...doc, content: [a, b] };

    it("keeps populated relations of reordered items in draft order", () => {
      const merged = merge("posts", page, {
        "posts:1": {
          content: [
            { id: "i2", blockType: "text", body: "B", tags: ["t1", "t2"] },
            { id: "i1", blockType: "hero", title: "A", image: "m1" },
          ],
        },
      });
      const [first, second] = merged.content as [typeof b, typeof a];
      expect(merged.content).toEqual([b, a]);
      expect(first.tags).toBe(b.tags);
      expect(second.image).toBe(a.image);
    });

    it("takes the draft value of an item whose relation changed", () => {
      const merged = merge("posts", page, {
        "posts:1": { content: [{ id: "i1", blockType: "hero", title: "A2", image: "m2" }] },
      });
      expect(merged.content).toEqual([{ id: "i1", blockType: "hero", title: "A2", image: "m2" }]);
    });

    it("adds new items as they are and drops removed ones", () => {
      const added = { id: "i3", blockType: "text", body: "C", tags: ["t9"] };
      const merged = merge("posts", page, {
        "posts:1": { content: [{ id: "i1", blockType: "hero", title: "A", image: "m1" }, added] },
      });
      expect(merged.content).toEqual([a, added]);
    });
  });

  it("merges a group per key", () => {
    const seo = { title: "Old", image: { id: "m1", url: "/a.png" } };
    const merged = merge(
      "posts",
      { ...doc, seo },
      { "posts:1": { seo: { title: "New", image: "m1" } } },
    );
    expect(merged.seo).toEqual({ title: "New", image: seo.image });
    expect(merged.seo.image).toBe(seo.image);
  });

  describe("with a locale", () => {
    const de = { ...doc, locale: "de" };

    it("merges a draft of the same locale", () => {
      expect(merge("posts", de, { "posts:1": { title: "Neu", locale: "de" } }).title).toBe("Neu");
    });

    it("skips a draft of another locale", () => {
      expect(merge("posts", de, { "posts:1": { title: "New", locale: "en" } })).toBe(de);
      expect(merge("posts", de, { "posts:1": { title: "New" } })).toBe(de);
    });

    it("merges into data without a locale", () => {
      expect(merge("posts", doc, { "posts:1": { title: "New", locale: "en" } }).title).toBe("New");
    });
  });

  it("keys globals by name and an empty id", () => {
    expect(merge("general", { title: "A" }, { "general:": { title: "B" } })).toEqual({
      title: "B",
    });
  });

  it("passes non-objects through", () => {
    expect(merge("posts", null, { "posts:": { title: "x" } })).toBeNull();
  });
});
