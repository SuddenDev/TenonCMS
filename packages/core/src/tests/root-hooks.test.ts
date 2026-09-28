import { beforeEach, describe, expect, it } from "vitest";
import {
  ConflictError,
  defineCms,
  defineCollection,
  defineGlobal,
  ValidationError,
} from "../index.ts";
import { seo } from "../presets/index.ts";
import { admin, fresh, origin, setup, status, type Env } from "./setup.ts";

let cms: Env["cms"];
let client: Env["client"];
let fetchWithSession: Env["fetchWithSession"];
beforeEach(() => {
  ({ cms, client, fetchWithSession } = fresh());
});
describe("root hooks", () => {
  const calls: string[] = [];
  const log =
    (where: string, stage: string) =>
    ({ collection, global }: { collection?: string; global?: string }) =>
      void calls.push(`${where}:${stage}:${collection ?? global}`);
  const stages = [
    "beforeOperation",
    "beforeValidate",
    "beforeChange",
    "afterChange",
    "beforeRead",
    "afterRead",
    "beforeDelete",
    "afterDelete",
    "afterOperation",
  ] as const;
  const hooksOf = (where: string) =>
    Object.fromEntries(stages.map((stage) => [stage, [log(where, stage)]]));
  const make = () =>
    defineCms({
      hooks: {
        ...hooksOf("root"),
        // A root hook MAY replace the main value, like a collection hook.
        afterRead: [log("root", "afterRead"), ({ docs }) => docs.map((d) => ({ ...d, seen: 1 }))],
      },
      collections: { posts: { fields: { title: { type: "text" } }, hooks: hooksOf("posts") } },
      globals: { site: { fields: { name: { type: "text" } } } },
      database: { url: ":memory:" },
      secret: "x".repeat(32),
    });
  beforeEach(() => void calls.splice(0));

  it("run after the collection's hooks in every stage", async () => {
    const cms = make();
    const post = await cms.create("posts", { title: "a" });
    expect(post).toMatchObject({ seen: 1 });
    expect(calls).toEqual([
      "posts:beforeOperation:posts",
      "root:beforeOperation:posts",
      "posts:beforeValidate:posts",
      "root:beforeValidate:posts",
      "posts:beforeChange:posts",
      "root:beforeChange:posts",
      "posts:afterChange:posts",
      "root:afterChange:posts",
      "posts:afterRead:posts",
      "root:afterRead:posts",
      "posts:afterOperation:posts",
      "root:afterOperation:posts",
    ]);
    calls.splice(0);
    await cms.find("posts");
    expect(calls).toEqual([
      "posts:beforeOperation:posts",
      "root:beforeOperation:posts",
      "posts:beforeRead:posts",
      "root:beforeRead:posts",
      "posts:afterRead:posts",
      "root:afterRead:posts",
      "posts:afterOperation:posts",
      "root:afterOperation:posts",
    ]);
    calls.splice(0);
    await cms.delete("posts", post.id);
    expect(calls).toEqual([
      "posts:beforeOperation:posts",
      "root:beforeOperation:posts",
      "posts:beforeDelete:posts",
      "root:beforeDelete:posts",
      "posts:afterDelete:posts",
      "root:afterDelete:posts",
      "posts:afterOperation:posts",
      "root:afterOperation:posts",
    ]);
  });

  it("run the global stages for globals", async () => {
    const cms = make();
    await cms.setGlobal("site", { name: "x" });
    expect(await cms.getGlobal("site")).toMatchObject({ seen: 1 });
    expect(calls).toEqual([
      "root:beforeValidate:site",
      "root:beforeChange:site",
      "root:afterChange:site",
      "root:afterRead:site",
      "root:beforeRead:site",
      "root:afterRead:site",
    ]);
  });
});

describe("populated hooks", () => {
  it("run read hooks on populated documents once per collection per hop", async () => {
    const calls: string[] = [];
    let seen: unknown;
    const count = ({ docs, collection }: { docs: unknown[]; collection?: string }) =>
      void calls.push(`${collection}:${docs.length}`);
    const cms = defineCms({
      collections: {
        authors: {
          fields: {
            name: { type: "text", hooks: { afterRead: [({ value }) => value?.toUpperCase()] } },
            posts: { type: "join", collection: "posts", on: "author" },
          },
          hooks: { beforeRead: [({ context }) => void (context.seen = true)], afterRead: [count] },
        },
        tags: { fields: { name: { type: "text" } }, hooks: { afterRead: [count] } },
        posts: {
          fields: {
            title: { type: "text" },
            author: { type: "relation", collection: "authors" },
            tags: { type: "relation", collection: "tags", many: true },
          },
          hooks: { afterRead: [({ context }) => void (seen = context.seen), count] },
        },
      },
      database: { url: ":memory:" },
      secret: "x".repeat(32),
    });
    const [a1, a2] = [
      await cms.create("authors", { name: "ann" }),
      await cms.create("authors", { name: "bo" }),
    ];
    const [t1, t2] = [
      await cms.create("tags", { name: "x" }),
      await cms.create("tags", { name: "y" }),
    ];
    await cms.create("posts", { title: "1", author: a1.id, tags: [t1.id] });
    await cms.create("posts", { title: "2", author: a2.id, tags: [t1.id, t2.id] });
    await cms.create("posts", { title: "3", author: a1.id });
    calls.length = 0;
    const posts = await cms.find("posts");
    expect(calls.sort()).toEqual(["authors:2", "posts:3", "tags:2"]);
    expect(seen).toBe(true);
    expect(posts.map((p) => p.author?.name)).toEqual(["ANN", "BO", "ANN"]);
    calls.length = 0;
    expect(
      (await cms.findById("authors", a1.id, { populate: { posts: true } }))?.posts,
    ).toHaveLength(2);
    expect(calls.sort()).toEqual(["authors:1", "posts:2"]);
  });
});
