import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import {
  ConflictError,
  defineCms,
  defineCollection,
  defineGlobal,
  ValidationError,
} from "../index.ts";
import { admin, origin, published, setup, unpublished, testDatabase } from "./setup.ts";

describe("hooks", () => {
  let calls: string[];
  beforeEach(() => {
    calls = [];
  });
  const log = (name: string) => () => void calls.push(name);
  const db = { database: testDatabase(), secret: "x".repeat(32) };
  const title = { title: { type: "text", required: true } } as const;
  const writeStages = [
    "beforeOperation",
    "beforeValidate",
    "beforeChange",
    "afterChange",
    "afterRead",
    "afterOperation",
  ] as const;
  const logAll = (stages: readonly string[]) =>
    Object.fromEntries(stages.map((s) => [s, [log(s)]]));

  it("run in order on create and update", async () => {
    const cms = defineCms({
      ...db,
      collections: { posts: { fields: title, hooks: logAll(writeStages) } },
    });
    const post = await cms.create("posts", { title: "a" });
    await cms.update("posts", post.id, { title: "b" });
    expect(calls).toEqual([...writeStages, ...writeStages]);
  });

  it("accept arrays and records in key order", async () => {
    const make = (beforeChange: (() => void)[] | Record<string, () => void>) =>
      defineCms({ ...db, collections: { posts: { fields: title, hooks: { beforeChange } } } });
    await make({ b: log("b"), a: log("a") }).create("posts", { title: "x" });
    await make([log("b"), log("a")]).create("posts", { title: "x" });
    expect(calls).toEqual(["b", "a", "b", "a"]);
  });

  it("use a returned value and keep the input on undefined", async () => {
    const posts = defineCollection({
      fields: title,
      hooks: {
        beforeValidate: [({ data }) => ({ ...data, title: data.title?.trim() }), () => undefined],
        afterChange: [({ doc }) => ({ ...doc, extra: 1 })],
        afterOperation: [({ result }) => ({ ...(result as object), op: 1 })],
      },
    });
    const cms = defineCms({ ...db, collections: { posts } });
    const post = await cms.create("posts", { title: "  Hi  " });
    expect(post).toMatchObject({ title: "Hi", extra: 1, op: 1 });
    const stored = await cms.findById("posts", post.id);
    expect(stored?.title).toBe("Hi");
    expect(stored).not.toHaveProperty("extra");
  });

  it("pass operation, id and originalDoc", async () => {
    const seen: Record<string, unknown>[] = [];
    const posts = defineCollection({
      fields: title,
      hooks: {
        beforeChange: [
          ({ operation, id, originalDoc, data }) =>
            void seen.push({ operation, id, original: originalDoc?.title, data: data.title }),
        ],
        afterChange: [
          ({ operation, previousDoc, doc }) =>
            void seen.push({ operation, previous: previousDoc?.title, doc: doc.title }),
        ],
      },
    });
    const cms = defineCms({ ...db, collections: { posts } });
    const post = await cms.create("posts", { title: "a" });
    await cms.update("posts", post.id, { title: "b" });
    expect(seen).toEqual([
      { operation: "create", id: undefined, original: undefined, data: "a" },
      { operation: "create", previous: undefined, doc: "a" },
      { operation: "update", id: post.id, original: "a", data: "b" },
      { operation: "update", previous: "a", doc: "b" },
    ]);
  });

  it("validate the beforeChange result", async () => {
    const cms = defineCms({
      ...db,
      collections: {
        posts: { fields: title, hooks: { beforeChange: [({ data }) => ({ ...data, title: "" })] } },
      },
    });
    await expect(cms.create("posts", { title: "a" })).rejects.toMatchObject({
      errors: { title: expect.any(String) },
    });
    expect(await cms.find("posts")).toEqual([]);
  });

  it("run in order on reads", async () => {
    const stages = ["beforeOperation", "beforeRead", "afterRead", "afterOperation"];
    const cms = defineCms({
      ...db,
      collections: { posts: { fields: title, hooks: logAll(stages) } },
    });
    const post = await cms.create("posts", { title: "a" });
    calls = [];
    await cms.find("posts");
    await cms.findOne("posts", { where: { title: "a" } });
    await cms.findById("posts", post.id);
    expect(calls).toEqual([...stages, ...stages, ...stages]);
  });

  it("run afterRead once per find with all docs", async () => {
    const counts: number[] = [];
    const posts = defineCollection({
      fields: title,
      hooks: {
        afterRead: [
          ({ docs, operation }) => {
            if (operation === "read") counts.push(docs.length);
            return docs.map((d) => ({ ...d, title: d.title.toUpperCase() }));
          },
        ],
      },
    });
    const cms = defineCms({ ...db, collections: { posts } });
    for (const t of ["a", "b", "c"]) await cms.create("posts", { title: t });
    expect((await cms.find("posts")).map((p) => p.title)).toEqual(["C", "B", "A"]);
    expect(counts).toEqual([3]);
  });

  it("run in order on delete", async () => {
    const seen: unknown[] = [];
    const record = ({ id, doc }: { id: string; doc: { title: string } }) =>
      void seen.push([id, doc.title]);
    const hooks = {
      ...logAll(["beforeOperation", "afterOperation"]),
      beforeDelete: [log("beforeDelete"), record],
      afterDelete: [log("afterDelete"), record],
    };
    const cms = defineCms({ ...db, collections: { posts: { fields: title, hooks } } });
    const post = await cms.create("posts", { title: "a" });
    calls = [];
    await cms.delete("posts", post.id);
    expect(calls).toEqual(["beforeOperation", "beforeDelete", "afterDelete", "afterOperation"]);
    expect(seen).toEqual([
      [post.id, "a"],
      [post.id, "a"],
    ]);
    calls = [];
    await cms.delete("posts", "missing");
    expect(calls).toEqual(["beforeOperation", "afterOperation"]);
  });

  it("run field hooks before collection hooks, depth-first into groups", async () => {
    const fieldStages = ["beforeValidate", "beforeChange", "afterChange", "afterRead"] as const;
    const fieldLog = Object.fromEntries(
      fieldStages.map((stage) => [
        stage,
        [({ path }: { path: string }) => void calls.push(`${path}:${stage}`)],
      ]),
    );
    const cms = defineCms({
      ...db,
      collections: {
        posts: {
          fields: {
            title: { type: "text", hooks: fieldLog },
            seo: {
              type: "group",
              hooks: fieldLog,
              fields: { title: { type: "text", hooks: fieldLog } },
            },
          },
          hooks: logAll(writeStages),
        },
      },
    });
    await cms.create("posts", { title: "a", seo: { title: "b" } });
    expect(calls).toEqual([
      "beforeOperation",
      ...fieldStages.flatMap((stage) =>
        ["title", "seo", "seo.title"].map((path) => `${path}:${stage}`).concat(stage),
      ),
      "afterOperation",
    ]);
  });

  it("give field hooks value, siblingData and path", async () => {
    const seen: unknown[] = [];
    const cms = defineCms({
      ...db,
      collections: {
        posts: {
          fields: {
            title: { type: "text" },
            seo: {
              type: "group",
              fields: {
                title: {
                  type: "text",
                  hooks: {
                    beforeChange: [
                      ({ value, siblingData, data, path }) => {
                        seen.push(path, { ...siblingData });
                        return value ?? (data.title as string);
                      },
                    ],
                  },
                },
              },
            },
          },
        },
      },
    });
    const post = await cms.create("posts", { title: "A", seo: {} });
    expect(post.seo?.title).toBe("A");
    expect(seen).toEqual(["seo.title", {}]);
  });

  it("run field afterRead once per value", async () => {
    let count = 0;
    const cms = defineCms({
      ...db,
      collections: {
        posts: {
          fields: {
            title: {
              type: "text",
              hooks: { afterRead: [() => void count++, ({ value }) => value?.toUpperCase()] },
            },
          },
        },
      },
    });
    for (const t of ["a", "b", "c"]) await cms.create("posts", { title: t });
    count = 0;
    expect((await cms.find("posts")).map((p) => p.title)).toEqual(["C", "B", "A"]);
    expect(count).toBe(3);
  });

  it("run on globals", async () => {
    const seen: unknown[] = [];
    const stages = ["beforeValidate", "beforeChange", "afterChange", "beforeRead", "afterRead"];
    const site = defineGlobal({
      fields: {
        name: { type: "text", hooks: { beforeChange: [({ path }) => void calls.push(path)] } },
      },
      hooks: {
        ...logAll(stages),
        afterRead: [
          log("afterRead"),
          ({ docs, global, operation }) => void seen.push([docs.length, global, operation]),
        ],
      },
    });
    const cms = defineCms({ ...db, collections: {}, globals: { site } });
    expect(await cms.setGlobal("site", { name: "a" })).toEqual({ name: "a", ...published });
    expect(calls).toEqual(["beforeValidate", "name", "beforeChange", "afterChange", "afterRead"]);
    calls = [];
    expect(await cms.getGlobal("site")).toEqual({ name: "a", ...published });
    expect(calls).toEqual(["beforeRead", "afterRead"]);
    expect(seen).toEqual([
      [1, "site", "setGlobal"],
      [1, "site", "getGlobal"],
    ]);
    const renamed = defineCms({
      ...db,
      collections: {},
      globals: {
        site: {
          fields: { name: { type: "text" } },
          hooks: { afterRead: [({ docs }) => [{ ...docs[0], name: "X" }]] },
        },
      },
    });
    expect(await renamed.getGlobal("site")).toEqual({ name: "X", ...unpublished });
  });

  it("validate the beforeChange result of a global", async () => {
    const cms = defineCms({
      ...db,
      collections: {},
      globals: { site: { fields: title, hooks: { beforeChange: [() => ({ title: "" })] } } },
    });
    await expect(cms.setGlobal("site", { title: "a" })).rejects.toBeInstanceOf(ValidationError);
    expect(await cms.getGlobal("site")).toEqual(unpublished);
  });

  it("get the session user over HTTP", async () => {
    const seen: unknown[] = [];
    const record = ({ user }: { user: { email: string } | null }) =>
      void seen.push(user?.email ?? null);
    const cms = defineCms({
      ...db,
      collections: {
        logs: { fields: {}, hooks: { beforeChange: [record] } },
        posts: {
          fields: title,
          hooks: {
            beforeChange: [record],
            afterChange: [async ({ cms }) => void (await cms.create("logs", {}))],
            afterRead: [record],
          },
        },
      },
    });
    const { client } = setup(cms);
    await client.signUp(admin);
    await client.create("posts", { title: "a" });
    expect(seen).toEqual(["a@b.co", "a@b.co", "a@b.co"]);
    seen.length = 0;
    await client.find("posts");
    expect(seen).toEqual(["a@b.co"]);
    seen.length = 0;
    await cms.create("posts", { title: "b" });
    expect(seen).toEqual([null, null, null]);
  });

  it("share context with nested calls", async () => {
    const cms = defineCms({
      ...db,
      collections: {
        logs: {
          fields: { message: { type: "text" } },
          hooks: {
            beforeChange: [({ data, context }) => ({ ...data, message: String(context.source) })],
          },
        },
        posts: {
          fields: title,
          hooks: {
            beforeChange: [({ context }) => void (context.source = "posts")],
            afterChange: [async ({ cms }) => void (await cms.create("logs", { message: "x" }))],
          },
        },
      },
    });
    await cms.create("posts", { title: "a" });
    expect((await cms.find("logs")).map((l) => l.message)).toEqual(["posts"]);
    await cms.create("logs", { message: "x" });
    expect((await cms.find("logs")).map((l) => l.message)).toEqual(["undefined", "posts"]);
  });

  it("stop a loop with context", async () => {
    const posts = defineCollection({
      fields: { ...title, views: { type: "number" } },
      hooks: {
        afterChange: [
          async ({ doc, cms, context }) => {
            calls.push("afterChange");
            if (context.counted) return;
            context.counted = true;
            await cms.update("posts", doc.id, { title: doc.title, views: (doc.views ?? 0) + 1 });
          },
        ],
      },
    });
    const cms = defineCms({ ...db, collections: { posts } });
    const post = await cms.create("posts", { title: "a" });
    expect(calls).toHaveLength(2);
    expect((await cms.findById("posts", post.id))?.views).toBe(1);
  });

  it("are not sent in /schema, and neither are validate and function defaults", async () => {
    const cms = defineCms({
      ...db,
      collections: {
        posts: {
          fields: {
            title: { type: "text", hooks: { afterRead: [log("f")] } },
            hooks: { type: "text" },
            email: { type: "text", validate: z.email() },
            status: {
              type: "select",
              options: ["draft", "live"],
              default: "draft",
              condition: { owner: { exists: true } },
            },
            owner: {
              type: "text",
              default: () => "x",
              validate: () => true,
              hooks: { beforeChange: [log("f")] },
            },
          },
          hooks: { beforeChange: [log("a")], afterRead: { b: log("b") } },
        },
      },
      globals: { site: { fields: {}, hooks: { afterRead: [log("g")] } } },
    });
    const { client } = setup(cms);
    await client.signUp(admin);
    const schema = await client.getSchema();
    expect(schema.collections?.posts.fields.hooks).toEqual({ type: "text" });
    expect(JSON.stringify(schema).replace('"hooks":{"type":"text"}', "")).not.toMatch(
      /validate|hooks/,
    );
    expect(schema.collections?.posts.fields.owner).not.toHaveProperty("default");
    expect(schema.collections?.posts.fields.status).toMatchObject({
      default: "draft",
      condition: { owner: { exists: true } },
    });
  });

  it("keep blocks, tabs and fieldsets named like options in /schema", async () => {
    const field = { type: "text" as const, hooks: { afterRead: [log("f")] } };
    const layout = {
      tabs: { hooks: { label: "Hooks" }, preview: {} },
      fieldsets: { permalink: { label: "Links" } },
    };
    const cms = defineCms({
      ...db,
      collections: {
        posts: {
          ...layout,
          permalink: "/{title}",
          hooks: { afterRead: [log("a")] },
          fields: {
            title: { type: "text", tab: "hooks", fieldset: "permalink" },
            content: {
              type: "blocks",
              blocks: { hooks: { fields: { field } }, preview: { fields: { field } } },
            },
          },
        },
      },
    });
    const { client } = setup(cms);
    await client.signUp(admin);
    const posts = (await client.getSchema()).collections!.posts as any;
    expect({ tabs: posts.tabs, fieldsets: posts.fieldsets }).toEqual(layout);
    expect(posts.hooks).toBeUndefined();
    expect(posts.preview).toBe(true);
    expect(posts.fields.content.blocks).toEqual({
      hooks: { fields: { field: { type: "text" } } },
      preview: { fields: { field: { type: "text" } } },
    });
  });
});

describe("transactions", () => {
  const db = { database: testDatabase(), secret: "x".repeat(32) };
  const logs = { fields: { message: { type: "text" } } } as const;

  it("roll back the write and nested writes", async () => {
    const cms = defineCms({
      ...db,
      collections: {
        logs,
        posts: {
          fields: { title: { type: "text" } },
          hooks: {
            afterChange: [
              async ({ cms }) => {
                await cms.create("logs", { message: "x" });
                throw new Error("boom");
              },
            ],
          },
        },
      },
    });
    await expect(cms.create("posts", { title: "a" })).rejects.toThrow("boom");
    expect(await cms.find("posts")).toEqual([]);
    expect(await cms.find("logs")).toEqual([]);
  });

  it("nested calls run on the write's transaction", async () => {
    const cms = defineCms({
      ...db,
      collections: {
        logs,
        posts: {
          fields: { title: { type: "text" }, log: { type: "text" } },
          hooks: {
            beforeChange: [
              async ({ cms, data }) => {
                await cms.find("logs");
                return { ...data, log: (await cms.create("logs", { message: "x" })).id };
              },
            ],
            afterChange: [async ({ cms, doc }) => void (await cms.findById("logs", doc.log))],
          },
        },
      },
    });
    await cms.create("posts", { title: "a" });
    expect(await cms.find("logs")).toHaveLength(1);
  });
});

describe("afterError", () => {
  let calls: unknown[];
  beforeEach(() => {
    calls = [];
  });
  const make = (
    throwing: () => void,
    afterError = (a: { operation: string; collection?: string; global?: string }) =>
      void calls.push(a),
  ) =>
    defineCms({
      hooks: {
        afterError: [
          ({ operation, collection, global }) =>
            void calls.push(["root", operation, collection ?? global]),
        ],
      },
      collections: {
        posts: {
          fields: { title: { type: "text" } },
          hooks: {
            afterError: [
              ({ operation, collection }) => void calls.push(["collection", operation, collection]),
              afterError,
            ],
            beforeChange: [throwing],
          },
        },
        notes: {
          fields: { post: { type: "relation", collection: "posts", required: true } },
          hooks: { afterError: [() => void calls.push("notes")] },
        },
        wrappers: {
          fields: {},
          hooks: {
            afterError: [() => void calls.push("wrappers")],
            beforeChange: [async ({ cms }) => void (await cms.create("posts", { title: "x" }))],
          },
        },
      },
      globals: { site: { fields: {}, hooks: { beforeChange: [throwing] } } },
      database: testDatabase(),
      secret: "x".repeat(32),
    });

  it("runs collection then root hooks and hides the message over HTTP", async () => {
    const cms = make(
      () => {
        throw new Error("secret");
      },
      () => undefined,
    );
    await expect(cms.create("posts", { title: "a" })).rejects.toThrow("secret");
    expect(calls).toEqual([
      ["collection", "create", "posts"],
      ["root", "create", "posts"],
    ]);
    const { client, fetch } = setup(cms);
    await client.signUp(admin);
    const res = await fetch(`${origin}/_tenon/collections/posts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain("secret");
  });

  it("does not run for ValidationError or ConflictError", async () => {
    const cms = make(() => {
      throw new ValidationError({ title: "Taken" });
    });
    await expect(cms.create("posts", { title: "a" })).rejects.toBeInstanceOf(ValidationError);
    const ok = make(() => undefined);
    const post = await ok.create("posts", { title: "a" });
    await ok.create("notes", { post: post.id });
    await expect(ok.delete("posts", post.id)).rejects.toBeInstanceOf(ConflictError);
    expect(calls).toEqual([]);
  });

  it("runs only the root hooks for a global", async () => {
    const cms = make(() => {
      throw new Error("boom");
    });
    await expect(cms.setGlobal("site", {})).rejects.toThrow("boom");
    expect(calls).toEqual([["root", "setGlobal", "site"]]);
  });

  it("keeps the original error when a hook throws", async () => {
    const cms = make(
      () => {
        throw new Error("first");
      },
      () => {
        throw new Error("second");
      },
    );
    await expect(cms.create("posts", { title: "a" })).rejects.toThrow("first");
    expect(calls).toEqual([
      ["collection", "create", "posts"],
      ["root", "create", "posts"],
    ]);
  });

  it("runs once, for the outer operation of a nested call", async () => {
    const cms = make(
      () => {
        throw new Error("boom");
      },
      () => undefined,
    );
    await expect(cms.create("wrappers", {})).rejects.toThrow("boom");
    expect(calls).toEqual(["wrappers", ["root", "create", "wrappers"]]);
  });
});
