import { beforeEach, describe, expect, it } from "vitest";
import { defineCms } from "../index.ts";
import { seo } from "../presets/index.ts";
import {
  admin,
  fresh,
  origin,
  published,
  setup,
  status,
  type Env,
  testDatabase,
  testDb,
  onPglite,
} from "./setup.ts";

let cms: Env["cms"];
let client: Env["client"];
let fetchWithSession: Env["fetchWithSession"];
beforeEach(() => {
  ({ cms, client, fetchWithSession } = fresh());
});

describe("datetime", () => {
  it("round-trips timestamps through the client and enforces validation and uniqueness", async () => {
    const { cms, client } = setup(
      defineCms({
        collections: {
          events: { fields: { start: { type: "datetime", required: true, unique: true } } },
        },
        media: false,
        database: testDatabase(),
        secret: "x".repeat(32),
      }),
    );
    await client.signUp(admin);
    const start = "2026-10-17T12:34:56.000Z";
    const event = await client.create("events", { start });
    expect(await client.findById("events", event.id)).toMatchObject({ start });
    expect(await client.find("events", { where: { start } })).toHaveLength(1);
    await expect(client.create("events", { start })).rejects.toMatchObject({ status: 400 });
    await expect(client.update("events", event.id, { start: "2026-10-17" })).rejects.toMatchObject({
      status: 400,
    });
    expect(await cms.findById("events", event.id)).toMatchObject({ start });
  });
});

describe("condition", () => {
  const make = (hooks = {}) =>
    defineCms({
      collections: {
        videos: {
          fields: {
            mediaType: { type: "select", options: ["image", "youtube"] },
            url: { type: "text", required: true, condition: { mediaType: "youtube" } },
          },
          hooks,
        },
      },
      database: testDatabase(),
      secret: "x".repeat(32),
    });

  it("lets a required field be missing while its condition is false", async () => {
    await expect(make().create("videos", { mediaType: "image" })).resolves.toMatchObject({
      mediaType: "image",
    });
    await expect(make().create("videos", { mediaType: "youtube" })).rejects.toMatchObject({
      errors: { url: expect.any(String) },
    });
  });

  it("keeps values of fields whose condition is false", async () => {
    const cms = make();
    const doc = await cms.create("videos", { mediaType: "image", url: "x" });
    expect(await cms.findById("videos", doc.id)).toMatchObject({ url: "x" });
  });

  it("checks the field again after beforeChange", async () => {
    const cms = make({
      beforeChange: [
        ({ data }: { data: Record<string, unknown> }) => ({ mediaType: "youtube", url: data.url }),
      ],
    });
    await expect(cms.create("videos", { mediaType: "image" })).rejects.toMatchObject({
      errors: { url: expect.any(String) },
    });
  });

  it("keeps the type check while the condition is false", async () => {
    await expect(make().create("videos", { mediaType: "image", url: 5 })).rejects.toMatchObject({
      errors: { url: expect.any(String) },
    });
  });
});

describe("default", () => {
  let seen: unknown[] = [];
  const make = () =>
    defineCms({
      collections: {
        items: {
          fields: {
            status: { type: "select", options: ["draft", "live"], default: "draft" },
            owner: { type: "text", default: async ({ user }) => user?.email ?? "system" },
            tags: { type: "relation", collection: "items", many: true, default: [] },
            meta: {
              type: "group",
              fields: {
                lang: { type: "text", default: "en" },
                title: { type: "text", required: true, default: "T" },
              },
            },
          },
          hooks: { beforeValidate: [({ data }) => void seen.push(data.status)] },
        },
      },
      database: testDatabase(),
      secret: "x".repeat(32),
    });

  it("fills undefined fields on create", async () => {
    const cms = make();
    const { client } = setup(cms);
    await client.signUp(admin);
    expect(await client.create("items", {})).toMatchObject({
      status: "draft",
      owner: "a@b.co",
      tags: [],
    });
    expect(await cms.create("items", {})).toMatchObject({ status: "draft", owner: "system" });
  });

  it("fills group children only when the group is sent", async () => {
    const cms = make();
    expect(await cms.create("items", { meta: {} })).toMatchObject({
      meta: { lang: "en", title: "T" },
    });
    expect(await cms.create("items", {})).not.toHaveProperty("meta");
  });

  it("does not replace null", async () => {
    expect(await make().create("items", { status: null })).toMatchObject({ status: null });
  });

  it("does not apply on update", async () => {
    const cms = make();
    const item = await cms.create("items", { status: null });
    expect(await cms.update("items", item.id, {})).toMatchObject({ status: null });
  });

  it("runs before beforeValidate", async () => {
    seen = [];
    await make().create("items", {});
    expect(seen).toEqual(["draft"]);
  });
});

describe("validate", () => {
  let calls: unknown[] = [];
  const make = () =>
    defineCms({
      collections: {
        events: {
          fields: {
            kind: { type: "text" },
            start: { type: "date" },
            end: {
              type: "date",
              validate: (v, { siblingData }) =>
                !v || v >= String(siblingData.start) || "Ends before start",
            },
            code: { type: "text", validate: async (v) => v !== "x" || "Not allowed" },
            seo: {
              type: "group",
              fields: {
                title: {
                  type: "text",
                  validate: (v, { path, operation }) => (calls.push([path, operation, v]), true),
                },
              },
            },
            url: { type: "text", condition: { kind: "link" }, validate: () => "Always wrong" },
          },
          hooks: { beforeChange: [() => void calls.push("beforeChange")] },
        },
        owners: { fields: { name: { type: "text" } } },
        things: {
          fields: {
            owner: { type: "relation", collection: "owners" },
            code: {
              type: "text",
              validate: (v, { operation }) => operation === "create" || "Locked",
            },
          },
        },
      },
      database: testDatabase(),
      secret: "x".repeat(32),
    });
  beforeEach(() => {
    calls = [];
  });

  it("collects all messages in one 400", async () => {
    const cms = make();
    const { client } = setup(cms);
    await client.signUp(admin);
    const error = await client
      .create("events", { start: "2026-02-01", end: "2026-01-01", code: "x" })
      .catch((e: unknown) => e);
    expect(error).toMatchObject({
      status: 400,
      body: {
        message: expect.any(String),
        errors: { end: "Ends before start", code: "Not allowed" },
      },
    });
    expect(calls).not.toContain("beforeChange");
  });

  it("passes the path of group children", async () => {
    await make().create("events", { seo: { title: "T" } });
    expect(calls).toContainEqual(["seo.title", "create", "T"]);
  });

  it("skips fields whose condition is false", async () => {
    const cms = make();
    await expect(cms.create("events", { url: "u" })).resolves.toMatchObject({ url: "u" });
    await expect(cms.create("events", { kind: "link", url: "u" })).rejects.toMatchObject({
      errors: { url: "Always wrong" },
    });
  });

  it("is skipped on set-null updates", async () => {
    const cms = make();
    const owner = await cms.create("owners", { name: "o" });
    const thing = await cms.create("things", { owner: owner.id, code: "c" });
    await cms.delete("owners", owner.id);
    expect(await cms.findById("things", thing.id, { populate: false })).toMatchObject({
      owner: null,
      code: "c",
    });
    await expect(cms.update("things", thing.id, { code: "c" })).rejects.toMatchObject({
      errors: { code: "Locked" },
    });
  });
});

describe("unique", () => {
  const make = () =>
    defineCms({
      collections: {
        tags: {
          fields: {
            name: { type: "text" },
            slug: { type: "text", unique: true },
            rank: { type: "number", unique: true },
          },
          hooks: {
            beforeChange: [({ data }) => (data.name ? { ...data, slug: data.name } : undefined)],
          },
        },
        other: { fields: { slug: { type: "text" } } },
      },
      database: testDatabase(),
      secret: "x".repeat(32),
    });

  it("rejects a used value", async () => {
    const cms = make();
    const { client } = setup(cms);
    await client.signUp(admin);
    await client.create("tags", { slug: "a", rank: 1 });
    const error = await client.create("tags", { slug: "a" }).catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 400, body: { errors: { slug: "Already used" } } });
    await expect(cms.create("tags", { rank: 1 })).rejects.toMatchObject({
      errors: { rank: "Already used" },
    });
  });

  it("is case-sensitive and per collection", async () => {
    const cms = make();
    await cms.create("other", { slug: "a" });
    await cms.create("tags", { slug: "a" });
    await expect(cms.create("tags", { slug: "A" })).resolves.toBeDefined();
  });

  it("never matches null or missing", async () => {
    const cms = make();
    await cms.create("tags", {});
    await cms.create("tags", {});
    await cms.create("tags", { slug: null });
    await expect(cms.create("tags", { slug: null })).resolves.toBeDefined();
  });

  it("lets a document keep its own value", async () => {
    const cms = make();
    const tag = await cms.create("tags", { slug: "a", rank: 1 });
    await expect(cms.update("tags", tag.id, { slug: "a", rank: 1 })).resolves.toMatchObject({
      slug: "a",
    });
  });

  it("rejects a used slug", async () => {
    const cms = defineCms({
      collections: {
        posts: {
          fields: { title: { type: "text" }, slug: { type: "slug", from: "title", unique: true } },
        },
      },
      database: testDatabase(),
      secret: "x".repeat(32),
    });
    const { client } = setup(cms);
    await client.signUp(admin);
    await client.create("posts", { title: "A", slug: "a" });
    const error = await client.create("posts", { title: "B", slug: "a" }).catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 400, body: { errors: { slug: "Already used" } } });
  });

  it("checks values set by beforeChange", async () => {
    const cms = make();
    await cms.create("tags", { slug: "a" });
    await expect(cms.create("tags", { name: "a" })).rejects.toMatchObject({
      errors: { slug: "Already used" },
    });
  });
});

describe("private", () => {
  const make = (database = testDatabase()) =>
    defineCms({
      collections: {
        people: {
          fields: {
            name: { type: "text" },
            email: { type: "text", private: true },
            contact: { type: "group", private: true, fields: { phone: { type: "text" } } },
            links: {
              type: "array",
              fields: { url: { type: "text" }, note: { type: "text", private: true } },
            },
            content: {
              type: "blocks",
              blocks: {
                quote: {
                  fields: { text: { type: "text" }, source: { type: "text", private: true } },
                },
              },
            },
          },
        },
        posts: { fields: { author: { type: "relation", collection: "people" } } },
      },
      globals: {
        site: { fields: { name: { type: "text" }, key: { type: "text", private: true } } },
      },
      database,
      secret: "x".repeat(32),
    });
  const person = { name: "A", email: "e", contact: { phone: "p" } };

  it("is missing on public reads and sent with a session", async () => {
    const cms = make();
    const { client } = setup(cms);
    const p = await cms.create("people", person);
    await cms.setGlobal("site", { name: "S", key: "k" });
    const reads = async () => [
      await client.findById("people", p.id),
      (await client.find("people"))[0],
      await client.findOne("people", { where: { name: "A" } }),
    ];
    for (const read of await reads())
      expect(read).toEqual({
        name: "A",
        id: p.id,
        createdAt: expect.any(String),
        ...published,
      });
    expect(await client.getGlobal("site")).toEqual({ name: "S", ...published });
    await client.signUp(admin);
    for (const read of await reads()) expect(read).toMatchObject(person);
    expect(await client.getGlobal("site")).toEqual({ name: "S", key: "k", ...published });
  });

  it("is missing in array items on public reads and sent with a session", async () => {
    const cms = make();
    const { client } = setup(cms);
    const p = await cms.create("people", { name: "A", links: [{ id: "l", url: "u", note: "n" }] });
    expect((await client.findById("people", p.id)).links).toEqual([{ id: "l", url: "u" }]);
    await client.signUp(admin);
    expect((await client.findById("people", p.id)).links).toEqual([
      { id: "l", url: "u", note: "n" },
    ]);
  });

  it("is missing in block items on public reads and sent with a session", async () => {
    const cms = make();
    const { client } = setup(cms);
    const item = { id: "q", blockType: "quote", text: "t", source: "s" } as const;
    const p = await cms.create("people", { name: "A", content: [item] });
    expect((await client.findById("people", p.id)).content).toEqual([
      { id: "q", blockType: "quote", text: "t" },
    ]);
    await client.signUp(admin);
    expect((await client.findById("people", p.id)).content).toEqual([item]);
  });

  it("reduces a block item of an unknown block to id and blockType on public reads", async () => {
    const { database, exec } = testDb();
    const cms = make(database);
    const { client } = setup(cms);
    const p = await cms.create("people", {
      name: "A",
      content: [{ id: "q", blockType: "quote", text: "t", source: "s" }],
    });
    // A block removed from the schema leaves its items in the stored data.
    await exec(
      onPglite
        ? `UPDATE cms_documents SET data = jsonb_set(data::jsonb, '{content,0,blockType}', '"gone"')::text WHERE id = ?`
        : "UPDATE cms_documents SET data = json_set(data, '$.content[0].blockType', 'gone') WHERE id = ?",
      [p.id],
    );
    const item = { id: "q", blockType: "gone", text: "t", source: "s" };
    expect((await client.findById("people", p.id)).content).toEqual([
      { id: "q", blockType: "gone" },
    ]);
    await client.signUp(admin);
    expect((await client.findById("people", p.id)).content).toEqual([item]);
  });

  it("cannot be filtered without a session", async () => {
    const { client, fetch } = setup(make());
    const get = (query: string) => fetch(`${origin}/api/cms/collections/people?${query}`);
    expect((await get("email=e")).status).toBe(400);
    await client.signUp(admin);
    expect((await get("email=e")).status).toBe(200);
  });

  it("is left out of a select without a session and returned with one", async () => {
    const cms = make();
    const { client, fetch } = setup(cms);
    const p = await cms.create("people", person);
    const get = async () =>
      (
        await fetch(`${origin}/api/cms/collections/people/${p.id}?select=name,email,contact.phone`)
      ).json();
    expect(await get()).toEqual({ id: p.id, name: "A" });
    await client.signUp(admin);
    expect(await get()).toEqual({ id: p.id, name: "A", email: "e", contact: { phone: "p" } });
  });

  it("is missing in populated documents on public reads", async () => {
    const cms = make();
    const { client } = setup(cms);
    const p = await cms.create("people", person);
    const post = await cms.create("posts", { author: p.id });
    expect((await client.findById("posts", post.id)).author).toEqual({
      name: "A",
      id: p.id,
      createdAt: expect.any(String),
      ...published,
    });
  });
});
