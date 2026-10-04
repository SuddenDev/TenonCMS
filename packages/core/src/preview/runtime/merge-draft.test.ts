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

  it("keys globals by name and an empty id", () => {
    expect(merge("general", { title: "A" }, { "general:": { title: "B" } })).toEqual({
      title: "B",
    });
  });

  it("passes non-objects through", () => {
    expect(merge("posts", null, { "posts:": { title: "x" } })).toBeNull();
  });
});
