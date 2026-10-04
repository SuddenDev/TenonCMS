import { describe, expect, it } from "vitest";
import { pick } from "./select-fields.ts";
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
