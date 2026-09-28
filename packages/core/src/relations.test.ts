import { describe, expect, it } from "vitest";
import { checkSelect, parsePopulate, parseSelect, pick } from "./relations.ts";
import type { Collection } from "./schema.ts";

const collections: Record<string, Collection> = {
  media: { fields: { url: { type: "text", required: true } } },
  authors: {
    fields: {
      name: { type: "text", required: true },
      avatar: { type: "relation", collection: "media" },
      posts: { type: "join", collection: "posts", on: "author" },
    },
  },
  tags: { fields: { name: { type: "text", required: true } } },
  posts: {
    fields: {
      title: { type: "text", required: true },
      author: { type: "relation", collection: "authors" },
      tags: { type: "relation", collection: "tags", many: true },
      seo: { type: "group", fields: { image: { type: "relation", collection: "media" } } },
    },
  },
};

describe("parsePopulate", () => {
  const parse = (query: { populate?: string; depth?: string }, name = "posts") =>
    parsePopulate(collections, collections[name].fields, query, { depth: 2, maxDepth: 2 });

  it("parses depth, false and paths", () => {
    expect(parse({})).toEqual(2);
    expect(parse({ populate: "false" })).toEqual(false);
    expect(parse({ depth: "1" })).toEqual(1);
    expect(parse({ populate: "author.avatar,tags" })).toEqual({
      author: { avatar: true },
      tags: true,
    });
    expect(parse({ populate: "author,author.avatar" })).toEqual({ author: { avatar: true } });
    expect(parse({ populate: "author.avatar,author" })).toEqual({ author: { avatar: true } });
    expect(parse({ populate: "seo.image" })).toEqual({ seo: { image: true } });
    expect(parse({ populate: "seo" })).toEqual({ seo: true });
    expect(parse({ populate: "posts.tags" }, "authors")).toEqual({ posts: { tags: true } });
  });

  it.each([
    [{ populate: "title" }, "Invalid populate: title"],
    [{ populate: "nope" }, "Invalid populate: nope"],
    [{ populate: "author.nope" }, "Invalid populate: author.nope"],
    [{ populate: "" }, "Invalid populate: "],
    [{ populate: "constructor" }, "Invalid populate: constructor"],
    [{ depth: "3" }, "Invalid depth: 3"],
    [{ depth: "-1" }, "Invalid depth: -1"],
    [{ depth: "x" }, "Invalid depth: x"],
    [{ populate: "author.posts.author" }, "Invalid populate: author.posts.author"],
  ])("rejects %o", (query, message) => {
    expect(parse(query)).toBe(message);
  });
});

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

describe("checkSelect", () => {
  const check = (
    select: Record<string, any>,
    spec: Parameters<typeof checkSelect>[3] = 2,
    name = "posts",
  ) => checkSelect(collections, collections[name].fields, select, spec);

  it("accepts meta keys only on documents", () => {
    expect(check({ author: { id: true, createdAt: true } })).toBeUndefined();
    expect(check({ seo: { id: true } })).toBe("seo.id");
    expect(check({ seo: { updatedAt: true } })).toBe("seo.updatedAt");
    expect(checkSelect(collections, collections.posts.fields, { id: true }, 2, "", false)).toBe(
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

describe("parseSelect", () => {
  it("builds nested objects from dot paths, longer path wins", () => {
    expect(parseSelect("title,path,parent.title,parent.path")).toEqual({
      title: true,
      path: true,
      parent: { title: true, path: true },
    });
    expect(parseSelect("seo,seo.title")).toEqual({ seo: { title: true } });
    expect(parseSelect("seo.title,seo")).toEqual({ seo: { title: true } });
    expect(parseSelect("a.b.c")).toEqual({ a: { b: { c: true } } });
    expect(parseSelect("")).toEqual({});
    expect(parseSelect("title,,path")).toEqual({ title: true, path: true });
  });

  it("never writes to Object.prototype", () => {
    const select = parseSelect("__proto__.polluted,constructor.prototype.polluted");
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.keys(select)).toEqual(["__proto__", "constructor"]);
  });
});
