import { describe, expect, it } from "vitest";
import { badSelectPath, pick, step } from "./populate.ts";
import type { Collection } from "../schema/index.ts";

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

describe("pick", () => {
  const media = { id: "m", url: "/a.png", createdAt: "c", updatedAt: "u" };
  const post = {
    id: "p",
    createdAt: "c",
    updatedAt: "u",
    title: "Hi",
    author: { id: "a", name: "Ann", avatar: media, createdAt: "c", updatedAt: "u", posts: [] },
    tags: [
      { id: "t1", name: "one" },
      { id: "t2", name: "two" },
    ],
    seo: { image: media },
  };
  const p = (
    select: Record<string, any>,
    doc: Record<string, any> = post,
    fields = collections.posts.fields,
  ) => pick(collections, fields, doc, select);

  it("keeps id and the listed fields", () => {
    expect(p({ title: true })).toEqual({ id: "p", title: "Hi" });
    expect(p({})).toEqual({ id: "p" });
    expect(p({ createdAt: true })).toEqual({ id: "p", createdAt: "c" });
  });

  it("takes a whole group or part of it", () => {
    expect(p({ seo: true })).toEqual({ id: "p", seo: { image: media } });
    expect(p({ seo: { image: { url: true } } })).toEqual({
      id: "p",
      seo: { image: { id: "m", url: "/a.png" } },
    });
  });

  it("takes a relation as populate left it, or its listed fields", () => {
    expect(p({ author: true }).author).toBe(post.author);
    expect(p({ author: { name: true } })).toEqual({ id: "p", author: { id: "a", name: "Ann" } });
    expect(p({ author: { name: true } }, { ...post, author: "a" }).author).toBe("a");
    expect(p({ author: { name: true } }, { ...post, author: null }).author).toBeNull();
    expect(p({ tags: { name: true } }).tags).toEqual([
      { id: "t1", name: "one" },
      { id: "t2", name: "two" },
    ]);
  });

  it("takes a join item by item and skips missing keys", () => {
    const author = { id: "a", name: "Ann", posts: [post] };
    expect(p({ posts: { title: true } }, author, collections.authors.fields)).toEqual({
      id: "a",
      posts: [{ id: "p", title: "Hi" }],
    });
    expect(p({ avatar: true, name: true }, author, collections.authors.fields)).toEqual({
      id: "a",
      name: "Ann",
    });
  });
});

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

describe("step", () => {
  it("treats image and file like a relation", () => {
    const image = { type: "image" } as const;
    const file = { type: "file", many: true } as const;
    expect(step(2, "hero", image)).toEqual({ on: true, child: 1 });
    expect(step(0, "hero", image)).toEqual({ on: false, child: -1 });
    expect(step({ hero: true }, "hero", image)).toEqual({ on: true, child: false });
    expect(step({ other: true }, "docs", file)).toEqual({ on: false, child: false });
    expect(step(false, "docs", file)).toEqual({ on: false, child: false });
  });
});
