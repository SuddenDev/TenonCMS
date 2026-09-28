import { describe, expect, it } from "vitest";
import { parsePopulate, parseSelect } from "./query.ts";
import type { Collection } from "../schema/index.ts";

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
