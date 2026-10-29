import { describe, expect, it } from "vitest";
import type { Fields } from "@/shared/api";
import { resolveDraft } from "./draft-documents";

const docs: Record<string, unknown> = {
  "media:m1": { id: "m1", src: "/a.png" },
  "authors:a1": { id: "a1", name: "Ann" },
  "tags:t1": { id: "t1", name: "one" },
  "tags:t2": { id: "t2", name: "two" },
};
const load = async (collection: string, id: string) => {
  const doc = docs[`${collection}:${id}`];
  if (!doc) throw new Error("not found");
  return doc;
};

const fields = {
  title: { type: "text" },
  hero: { type: "image" },
  author: { type: "relation", collection: "authors" },
  tags: { type: "relation", collection: "tags", many: true },
  seo: {
    type: "group",
    fields: { image: { type: "image" }, owner: { type: "relation", collection: "authors" } },
  },
  items: { type: "array", fields: { author: { type: "relation", collection: "authors" } } },
} as unknown as Fields;

describe("resolveDraft", () => {
  it("replaces relations and media with their documents", async () => {
    const out = await resolveDraft(
      fields,
      { title: "T", hero: "m1", author: "a1", tags: ["t2", "t1"] },
      load,
    );
    expect(out).toEqual({
      title: "T",
      hero: docs["media:m1"],
      author: docs["authors:a1"],
      tags: [docs["tags:t2"], docs["tags:t1"]],
    });
  });

  it("reaches groups and items", async () => {
    const out = await resolveDraft(
      fields,
      { seo: { image: "m1", owner: "a1" }, items: [{ id: "i1", author: "a1" }] },
      load,
    );
    expect(out).toEqual({
      seo: { image: docs["media:m1"], owner: docs["authors:a1"] },
      items: [{ id: "i1", author: docs["authors:a1"] }],
    });
  });

  it("leaves empty values alone", async () => {
    const data = { author: null, tags: [], hero: null };
    expect(await resolveDraft(fields, data, load)).toEqual(data);
  });

  it("keeps the id of a relation that does not load, and nulls missing media", async () => {
    const out = await resolveDraft(
      fields,
      { author: "gone", tags: ["t1", "gone"], hero: "gone" },
      load,
    );
    expect(out).toEqual({ author: "gone", tags: [docs["tags:t1"], "gone"], hero: null });
  });
});
