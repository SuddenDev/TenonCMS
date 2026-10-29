import { beforeEach, describe, expect, it } from "vitest";
import { defineCms, defineCollection, defineGlobal } from "../index.ts";
import { page, seo } from "../presets/index.ts";
import {
  admin,
  fresh,
  origin,
  relational,
  seed,
  setup,
  status,
  tmpDir,
  type Env,
  testDatabase,
} from "./setup.ts";
import { local } from "../media/storage/local/index.ts";

let cms: Env["cms"];
let client: Env["client"];
let fetchWithSession: Env["fetchWithSession"];
beforeEach(() => {
  ({ cms, client, fetchWithSession } = fresh());
});

describe("relation schema", () => {
  const join = { type: "join", collection: "posts", on: "author" };
  it.each([
    [
      "unknown target",
      { collections: { posts: { fields: { a: { type: "relation", collection: "nope" } } } } },
      /unknown collection "nope"/,
    ],
    [
      "join on unknown field",
      {
        collections: {
          a: { fields: { p: { type: "join", collection: "posts", on: "x" } } },
          posts: { fields: {} },
        },
      },
      /join "a.p"/,
    ],
    [
      "join on a non-relation",
      {
        collections: {
          a: { fields: { p: { type: "join", collection: "posts", on: "title" } } },
          posts: { fields: { title: { type: "text" } } },
        },
      },
      /join "a.p"/,
    ],
    [
      "join on a relation to another collection",
      {
        collections: {
          a: { fields: { p: join } },
          b: { fields: {} },
          posts: { fields: { author: { type: "relation", collection: "b" } } },
        },
      },
      /join "a.p"/,
    ],
    [
      "required + set-null",
      {
        collections: {
          a: {
            fields: {
              r: { type: "relation", collection: "a", required: true, onDelete: "set-null" },
            },
          },
        },
      },
      /set-null/,
    ],
    [
      "join in a global",
      {
        collections: { posts: { fields: { author: { type: "relation", collection: "posts" } } } },
        globals: { g: { fields: { p: join } } },
      },
      /join/,
    ],
    [
      "join in a group",
      {
        collections: {
          a: { fields: { g: { type: "group", fields: { p: join } } } },
          posts: { fields: { author: { type: "relation", collection: "a" } } },
        },
      },
      /join/,
    ],
    ["depth above maxDepth", { collections: {}, populate: { depth: 6 } }, /maxDepth/],
    [
      "cascade in a global",
      {
        collections: { a: { fields: {} } },
        globals: {
          g: { fields: { a: { type: "relation", collection: "a", onDelete: "cascade" } } },
        },
      },
      /cascade/,
    ],
  ])("rejects %s", (_, config, message) => {
    expect(() =>
      defineCms({ ...(config as object), database: testDatabase(), secret: "" } as never),
    ).toThrow(message);
  });

  it("accepts relations, joins through groups and self-references", () => {
    expect(() => relational()).not.toThrow();
  });

  it("checks relation targets and join paths at the type level", () => {
    const db = { database: testDatabase(), secret: "" };
    const authors = defineCollection({
      fields: {
        name: { type: "text" },
        posts: { type: "join", collection: "posts", on: "author" },
      },
    });
    const posts = defineCollection({
      fields: {
        author: { type: "relation", collection: "authors" },
        seo: { type: "group", fields: { image: { type: "relation", collection: "posts" } } },
        parent: { type: "relation", collection: "posts", many: true },
      },
    });
    const site = defineGlobal({ fields: { home: { type: "relation", collection: "posts" } } });
    const unknown = defineCollection({ fields: { a: { type: "relation", collection: "" } } });
    const inGroup = defineCollection({
      fields: { g: { type: "group", fields: { a: { type: "relation", collection: "nope" } } } },
    });
    const joinTarget = defineCollection({
      fields: { p: { type: "join", collection: "nope", on: "author" } },
    });
    const joinOnText = defineCollection({
      fields: { p: { type: "join", collection: "authors", on: "name" } },
    });
    const joinOnOther = defineCollection({
      fields: { p: { type: "join", collection: "posts", on: "author" } },
    });
    const badGlobal = defineGlobal({ fields: { home: { type: "relation", collection: "nope" } } });
    () => {
      defineCms({ ...db, collections: { posts, authors }, globals: { site } });
      // @ts-expect-error unknown collection
      defineCms({ ...db, collections: { posts, authors, unknown } });
      // @ts-expect-error unknown collection inside a group
      defineCms({ ...db, collections: { posts, authors, inGroup } });
      // @ts-expect-error join on an unknown collection
      defineCms({ ...db, collections: { posts, authors, joinTarget } });
      // @ts-expect-error join on a field that is not a relation
      defineCms({ ...db, collections: { posts, authors, joinOnText } });
      // @ts-expect-error join on a relation that points to another collection
      defineCms({ ...db, collections: { posts, authors, joinOnOther } });
      // @ts-expect-error relation in a global to an unknown collection
      defineCms({ ...db, collections: { posts, authors }, globals: { badGlobal } });
      defineCms({
        ...db,
        // @ts-expect-error inline: unknown collection
        collections: { a: { fields: { b: { type: "relation", collection: "nope" } } } },
      });
      defineCms({
        ...db,
        collections: {
          a: {
            fields: {
              b: { type: "relation", collection: "a" },
              // @ts-expect-error inline: join on a field that is not a relation
              j: { type: "join", collection: "a", on: "x" },
            },
          },
        },
      });
      defineCms({
        ...db,
        collections: {
          a: {
            fields: {
              b: { type: "relation", collection: "a" },
              j: { type: "join", collection: "a", on: "b" },
            },
          },
        },
      });
    };
  });
});

describe("relation writes", () => {
  let r: ReturnType<typeof setup<ReturnType<typeof relational>>>;
  let ids: Awaited<ReturnType<typeof seed>>;
  beforeEach(async () => {
    r = setup(relational());
    await r.client.signUp(admin);
    ids = await seed(r.cms);
  });

  it("rejects an unknown id", async () => {
    const { client } = r;
    expect(await status(client.create("posts", { title: "x", author: "nope" }))).toBe(400);
    expect(await status(client.create("posts", { title: "x", tags: ["nope"] }))).toBe(400);
    expect(await status(client.create("posts", { title: "x", seo: { image: "nope" } }))).toBe(400);
    expect(await status(client.setGlobal("site", { logo: "nope" }))).toBe(400);
  });

  it("rejects an id from another collection", async () => {
    expect(await status(r.client.create("posts", { title: "x", author: ids.t1.id }))).toBe(400);
  });

  it("rejects a self-reference", async () => {
    const page = await r.cms.create("pages", { title: "p" });
    expect(await status(r.client.update("pages", page.id, { title: "x", parent: page.id }))).toBe(
      400,
    );
    expect(await r.cms.findById("pages", page.id)).not.toHaveProperty("parent");
  });

  it("returns ids", async () => {
    expect(await r.client.create("posts", { title: "x", author: ids.a.id })).toMatchObject({
      author: ids.a.id,
    });
  });

  it("rejects duplicates over HTTP", async () => {
    expect(
      await status(r.client.create("posts", { title: "x", tags: [ids.t1.id, ids.t1.id] })),
    ).toBe(400);
  });
});

describe("relation filters", () => {
  let r: ReturnType<typeof setup<ReturnType<typeof relational>>>;
  let ids: Awaited<ReturnType<typeof seed>>;
  beforeEach(async () => {
    r = setup(relational());
    ids = await seed(r.cms);
  });
  const get = (path: string) => r.cms.fetch(new Request(`${origin}/api/cms${path}`));

  it("filters by a single relation", async () => {
    expect((await r.cms.find("posts", { where: { author: ids.a.id } })).map((p) => p.id)).toEqual([
      ids.p.id,
    ]);
    expect(
      (await (await get(`/collections/posts?author=${ids.a.id}`)).json()).map(
        (p: { id: string }) => p.id,
      ),
    ).toEqual([ids.p.id]);
  });

  it("rejects many relations and joins", async () => {
    await expect(r.cms.find("posts", { where: { tags: "x" } as never })).rejects.toThrow(
      /not filterable/,
    );
    await expect(r.cms.find("authors", { where: { posts: "x" } as never })).rejects.toThrow(
      /not filterable/,
    );
    expect((await get("/collections/posts?tags=x")).status).toBe(400);
    expect((await get("/collections/authors?posts=x")).status).toBe(400);
  });

  it("rejects many relations and joins at the type level", () => {
    () => {
      // @ts-expect-error many relations are not filterable
      r.cms.find("posts", { where: { tags: "x" } });
      // @ts-expect-error joins are not filterable
      r.cms.find("authors", { where: { posts: "x" } });
      // @ts-expect-error many relations are not filterable
      r.client.find("posts", { where: { tags: "x" } });
    };
  });
});

describe("references inside array items", () => {
  const make = () =>
    defineCms({
      collections: {
        pages: { fields: { title: { type: "text" } } },
        menus: {
          fields: {
            links: {
              type: "array",
              fields: {
                page: { type: "relation", collection: "pages" },
                also: { type: "relation", collection: "pages", many: true },
                image: { type: "image" },
              },
            },
          },
        },
      },
      database: testDatabase(),
      secret: "x".repeat(32),
      media: { storage: local({ dir: tmpDir() }) },
    });

  it("fails at the positional path of the item with an unknown id", async () => {
    const { cms, client } = setup(make());
    await client.signUp(admin);
    const p = await cms.create("pages", {});
    const error = (links: object[]) =>
      client.create("menus", { links } as never).catch((e: unknown) => e);

    expect(await error([{ page: p.id }, { page: "nope" }])).toMatchObject({
      status: 400,
      body: { errors: { "links.1.page": expect.any(String) } },
    });
    expect(await error([{ also: [p.id] }, {}, { also: [p.id, "nope"] }])).toMatchObject({
      body: { errors: { "links.2.also": expect.any(String) } },
    });
    expect(await error([{ image: "nope" }])).toMatchObject({
      body: { errors: { "links.0.image": expect.any(String) } },
    });
    expect(
      await status(client.create("menus", { links: [{ page: p.id }, {}] } as never)),
    ).toBeUndefined();
  });
});

describe("references inside block items", () => {
  const make = () =>
    defineCms({
      collections: {
        pages: { fields: { title: { type: "text" } } },
        landing: {
          fields: {
            content: {
              type: "blocks",
              blocks: {
                text: { fields: { body: { type: "text" } } },
                hero: {
                  fields: {
                    image: { type: "image" },
                    page: { type: "relation", collection: "pages" },
                  },
                },
              },
            },
          },
        },
      },
      database: testDatabase(),
      secret: "x".repeat(32),
      media: { storage: local({ dir: tmpDir() }) },
    });

  it("fails at the positional path of the block with an unknown id", async () => {
    const { cms, client } = setup(make());
    await client.signUp(admin);
    const p = await cms.create("pages", {});
    const error = (content: object[]) =>
      client.create("landing", { content } as never).catch((e: unknown) => e);

    expect(
      await error([{ blockType: "text" }, { blockType: "hero", image: "nope" }]),
    ).toMatchObject({
      status: 400,
      body: { errors: { "content.1.image": expect.any(String) } },
    });
    expect(
      await error([
        { blockType: "hero", page: p.id },
        { blockType: "hero", page: "nope" },
      ]),
    ).toMatchObject({
      body: { errors: { "content.1.page": expect.any(String) } },
    });
    expect(
      await status(
        client.create("landing", { content: [{ blockType: "hero", page: p.id }] } as never),
      ),
    ).toBeUndefined();
  });
});
