import { describe, expect, it } from "vitest";
import { badSelectPath } from "./validate-select.ts";
import type { Collection } from "../../schema/index.ts";

const collections: Record<string, Collection> = {
  assets: { fields: { url: { type: "text", required: true } } },
  authors: {
    fields: {
      name: { type: "text", required: true },
      avatar: { type: "relation", collection: "assets" },
      posts: { type: "join", collection: "posts", on: "author" },
    },
  },
  tags: { fields: { name: { type: "text", required: true } } },
  posts: {
    fields: {
      title: { type: "text", required: true },
      author: { type: "relation", collection: "authors" },
      tags: { type: "relation", collection: "tags", many: true },
      seo: { type: "group", fields: { image: { type: "relation", collection: "assets" } } },
    },
  },
};

describe("badSelectPath", () => {
  const check = (
    select: Record<string, any>,
    spec: Parameters<typeof badSelectPath>[3] = 2,
    name = "posts",
  ) => badSelectPath(collections, collections[name].fields, select, spec);

  it("accepts meta keys only on documents", () => {
    expect(check({ author: { id: true, createdAt: true } })).toBeUndefined();
    expect(check({ seo: { id: true } })).toBe("seo.id");
    expect(check({ seo: { updatedAt: true } })).toBe("seo.updatedAt");
    expect(badSelectPath(collections, collections.posts.fields, { id: true }, 2, "", false)).toBe(
      "id",
    );
  });

  it("accepts fields, meta keys, groups and resolved relations", () => {
    expect(check({ title: true, createdAt: true, id: true })).toBeUndefined();
    expect(check({ seo: true })).toBeUndefined();
    expect(check({ seo: { image: { url: true } } })).toBeUndefined();
    expect(check({ author: { name: true, avatar: { url: true } } })).toBeUndefined();
    expect(check({ author: { name: true } }, { author: true })).toBeUndefined();
    expect(check({ author: true }, false)).toBeUndefined();
    expect(check({ posts: { title: true } }, { posts: true }, "authors")).toBeUndefined();
    expect(check({ posts: true }, 2, "authors")).toBeUndefined();
  });

  it.each([
    [{ titel: true }, 2],
    [{ author: { nam: true } }, 2],
    [{ title: { x: true } }, 2],
    [{ author: { name: true } }, false],
    [{ author: { name: true } }, 0],
    [{ author: { avatar: { url: true } } }, 1],
    [{ author: { avatar: { url: true } } }, { author: true }],
    [{ tags: { name: true } }, { author: true }],
    [{ constructor: true }, 2],
  ])("rejects %o with populate %o", (select, spec) => {
    expect(check(select, spec as never)).toEqual(expect.any(String));
  });

  it("names the offending path", () => {
    expect(check({ titel: true })).toBe("titel");
    expect(check({ author: { nam: true } })).toBe("author.nam");
    expect(check({ title: { x: true } })).toBe("title");
    expect(check({ author: { avatar: { url: true } } }, 1)).toBe("author.avatar");
    expect(check({ seo: { nope: true } })).toBe("seo.nope");
  });

  it("rejects a join that populate does not name", () => {
    expect(check({ posts: { title: true } }, 2, "authors")).toBe("posts");
  });
});
