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
      links: {
        type: "array",
        fields: {
          label: { type: "text" },
          author: { type: "relation", collection: "authors" },
        },
      },
      content: {
        type: "blocks",
        blocks: {
          hero: {
            fields: {
              title: { type: "text" },
              author: { type: "relation", collection: "authors" },
            },
          },
          text: { fields: { body: { type: "text" } } },
        },
      },
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

  it("picks block items by their block type", () => {
    const content = [
      { id: "h", blockType: "hero", title: "Hi", author: post.author },
      { id: "t", blockType: "text", body: "B" },
      { id: "x", blockType: "nope", other: 1 },
    ];
    const doc = { ...post, content };
    expect(p({ content: true }, doc).content).toBe(content);
    expect(p({ content: { hero: { title: true } } }, doc).content).toEqual([
      { id: "h", blockType: "hero", title: "Hi" },
      { id: "t", blockType: "text" },
      { id: "x", blockType: "nope" },
    ]);
    expect(p({ content: { hero: { author: { name: true } } }, text: true }, doc).content).toEqual([
      { id: "h", blockType: "hero", author: { id: "a", name: "Ann" } },
      { id: "t", blockType: "text" },
      { id: "x", blockType: "nope" },
    ]);
    expect(p({ content: { text: true, hero: {} } }, doc).content).toEqual([
      { id: "h", blockType: "hero" },
      content[1],
      { id: "x", blockType: "nope" },
    ]);
    expect(p({ content: { toString: true } }, doc).content).toEqual([
      { id: "h", blockType: "hero" },
      { id: "t", blockType: "text" },
      { id: "x", blockType: "nope" },
    ]);
  });

  it("keeps the id of every array item and no other meta", () => {
    const links = [
      { id: "l1", label: "A", author: post.author },
      { id: "l2", label: "B", author: null },
    ];
    const doc = { ...post, links };
    expect(p({ links: true }, doc).links).toBe(links);
    expect(p({ links: { label: true } }, doc).links).toEqual([
      { id: "l1", label: "A" },
      { id: "l2", label: "B" },
    ]);
    expect(p({ links: { author: { name: true } } }, doc).links).toEqual([
      { id: "l1", author: { id: "a", name: "Ann" } },
      { id: "l2", author: null },
    ]);
    expect(p({ links: {} }, doc).links).toEqual([{ id: "l1" }, { id: "l2" }]);
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
