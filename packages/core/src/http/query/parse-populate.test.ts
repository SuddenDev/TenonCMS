import { describe, expect, it } from "vitest";
import { parsePopulate } from "./parse-populate.ts";
import type { Collection } from "../../schema/index.ts";

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
