import { createClient as createLibsql } from "@libsql/client";
import { beforeEach, describe, expect, it } from "vitest";
import { CmsError } from "../client/index.ts";
import { ConflictError, defineCms } from "../index.ts";
import { seo } from "../presets/index.ts";
import { admin, fresh, relational, seed, setup, status, tmpDb, type Env } from "./setup.ts";

let cms: Env["cms"];
let client: Env["client"];
let fetchWithSession: Env["fetchWithSession"];
beforeEach(() => {
  ({ cms, client, fetchWithSession } = fresh());
});

describe("onDelete", () => {
  let cms: ReturnType<typeof relational>;
  let ids: Awaited<ReturnType<typeof seed>>;
  beforeEach(async () => {
    cms = relational();
    ids = await seed(cms);
  });
  const ids0 = { populate: false } as const;

  it("set-null clears single, many, grouped and global references", async () => {
    const { m, a, p, t1, t2 } = ids;
    await cms.setGlobal("site", { logo: m.id, featured: [p.id] });
    await cms.delete("assets", m.id);
    expect((await cms.findById("posts", p.id, ids0))?.seo).toEqual({ image: null });
    expect((await cms.findById("authors", a.id, ids0))?.avatar).toBeNull();
    expect((await cms.getGlobal("site", ids0)).logo).toBeNull();
    await cms.delete("tags", t1.id);
    expect((await cms.findById("posts", p.id, ids0))?.tags).toEqual([t2.id]);
  });

  it("set-null clears several fields of one document", async () => {
    const cms = defineCms({
      collections: {
        a: { fields: {} },
        b: {
          fields: {
            x: { type: "relation", collection: "a" },
            y: { type: "relation", collection: "a", many: true },
          },
        },
      },
      database: { url: ":memory:" },
      secret: "",
    });
    const a = await cms.create("a", {});
    const b = await cms.create("b", { x: a.id, y: [a.id] });
    await cms.delete("a", a.id);
    expect(await cms.findById("b", b.id, { populate: false })).toMatchObject({ x: null, y: [] });
  });

  it("set-null updates updatedAt", async () => {
    const { t1, p } = ids;
    await new Promise((resolve) => setTimeout(resolve, 5));
    await cms.delete("tags", t1.id);
    expect((await cms.findById("posts", p.id))?.updatedAt).not.toBe(p.updatedAt);
  });
});

describe("onDelete restrict", () => {
  let r: ReturnType<typeof setup<ReturnType<typeof relational>>>;
  let ids: Awaited<ReturnType<typeof seed>>;
  beforeEach(async () => {
    r = setup(relational());
    ids = await seed(r.cms);
  });

  it("blocks the delete and changes nothing", async () => {
    const { cms, client } = r;
    const { p } = ids;
    const pin = await cms.create("pages", { title: "p" });
    const note = await cms.create("notes", { post: p.id, pin: pin.id });
    await cms.setGlobal("site", { featured: [p.id] });
    await client.signUp(admin);
    const error = await client.delete("posts", p.id).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CmsError);
    expect(error).toMatchObject({ status: 409, message: "Referenced by other documents" });
    expect((error as CmsError).body).toEqual({
      message: "Referenced by other documents",
      references: [{ collection: "notes", id: note.id }],
    });
    expect(await cms.findById("posts", p.id)).toBeDefined();
    expect((await cms.getGlobal("site", { populate: false })).featured).toEqual([p.id]);
  });

  it("throws ConflictError locally", async () => {
    const pin = await r.cms.create("pages", { title: "p" });
    const note = await r.cms.create("notes", { post: ids.p.id, pin: pin.id });
    const error = await r.cms.delete("posts", ids.p.id).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConflictError);
    expect(error).toMatchObject({ references: [{ collection: "notes", id: note.id }] });
  });

  it("applies explicit restrict and lists globals", async () => {
    const cms = defineCms({
      collections: {
        posts: { fields: {} },
        notes: {
          fields: { post: { type: "relation", collection: "posts", onDelete: "restrict" } },
        },
      },
      globals: {
        g: { fields: { pin: { type: "relation", collection: "posts", onDelete: "restrict" } } },
      },
      database: { url: ":memory:" },
      secret: "",
    });
    const p = await cms.create("posts", {});
    const note = await cms.create("notes", { post: p.id });
    await cms.setGlobal("g", { pin: p.id });
    await expect(cms.delete("posts", p.id)).rejects.toMatchObject({
      references: [{ collection: "notes", id: note.id }, { global: "g" }],
    });
  });
});

describe("onDelete cascade", () => {
  let cms: ReturnType<typeof relational>;
  beforeEach(() => {
    cms = relational();
  });
  const tree = async () => {
    const root = await cms.create("pages", { title: "root" });
    const child = await cms.create("pages", { title: "child", parent: root.id });
    const grandchild = await cms.create("pages", { title: "grandchild", parent: child.id });
    return [root, child, grandchild];
  };

  it("deletes recursively", async () => {
    const [root] = await tree();
    await cms.delete("pages", root.id);
    expect(await cms.find("pages")).toEqual([]);
  });

  it("ends cycles", async () => {
    const x = await cms.create("pages", { title: "x" });
    const y = await cms.create("pages", { title: "y", parent: x.id });
    await cms.update("pages", x.id, { title: "x", parent: y.id });
    await cms.delete("pages", x.id);
    expect(await cms.find("pages")).toEqual([]);
  });

  it("applies the rules of deleted documents", async () => {
    const [root, child] = await tree();
    const { p } = await seed(cms);
    await cms.create("notes", { post: p.id, pin: child.id });
    await expect(cms.delete("pages", root.id)).rejects.toBeInstanceOf(ConflictError);
    expect(await cms.find("pages")).toHaveLength(3);
  });
});

describe("onDelete hooks", () => {
  let calls: unknown[] = [];
  const make = (fail = false) =>
    defineCms({
      collections: {
        authors: { fields: { name: { type: "text" } } },
        posts: {
          fields: {
            title: { type: "text" },
            author: { type: "relation", collection: "authors", onDelete: "set-null" },
          },
          hooks: {
            beforeChange: [
              ({ operation, data }) => {
                calls.push(["beforeChange", operation, data.author]);
                if (fail && operation === "update") throw new Error("boom");
              },
            ],
            afterChange: [
              ({ operation, doc }) => void calls.push(["afterChange", operation, doc.author]),
            ],
          },
        },
        comments: {
          fields: { post: { type: "relation", collection: "posts", onDelete: "cascade" } },
          hooks: {
            beforeDelete: [({ id }) => void calls.push(["beforeDelete", id])],
            afterDelete: [({ id }) => void calls.push(["afterDelete", id])],
          },
        },
      },
      database: { url: ":memory:" },
      secret: "x".repeat(32),
    });
  const seed = async (cms: ReturnType<typeof make>) => {
    const author = await cms.create("authors", { name: "a" });
    const post = await cms.create("posts", { title: "p", author: author.id });
    const comment = await cms.create("comments", { post: post.id });
    calls = [];
    return { author, post, comment };
  };

  it("run the referencing collection's update and delete hooks", async () => {
    const cms = make();
    const { author, post, comment } = await seed(cms);
    await cms.delete("authors", author.id);
    expect(calls).toEqual([
      ["beforeChange", "update", null],
      ["afterChange", "update", null],
    ]);
    calls = [];
    await cms.delete("posts", post.id);
    expect(calls).toEqual([
      ["beforeDelete", comment.id],
      ["afterDelete", comment.id],
    ]);
  });

  it("roll back the delete when an effect hook throws", async () => {
    const cms = make(true);
    const { author } = await seed(cms);
    await expect(cms.delete("authors", author.id)).rejects.toThrow("boom");
    expect(await cms.findById("authors", author.id)).toBeDefined();
  });

  it("clear a reference whose other relation points to a document deleted in the same cascade", async () => {
    const other = defineCms({
      collections: {
        pages: {
          fields: { parent: { type: "relation", collection: "pages", onDelete: "cascade" } },
        },
        links: {
          fields: {
            a: { type: "relation", collection: "pages" },
            b: { type: "relation", collection: "pages" },
          },
        },
      },
      database: { url: ":memory:" },
      secret: "x".repeat(32),
    });
    const x = await other.create("pages", {});
    const y = await other.create("pages", { parent: x.id });
    const z = await other.create("pages", { parent: y.id });
    const link = await other.create("links", { a: z.id, b: y.id });
    await other.delete("pages", x.id);
    expect(await other.find("pages")).toEqual([]);
    expect(await other.findById("links", link.id, { populate: false })).toMatchObject({
      a: null,
      b: null,
    });
  });
});

describe("onDelete inside array items", () => {
  const ids0 = { populate: false } as const;
  const link = (onDelete: "restrict" | "set-null" | "cascade") =>
    ({
      type: "array",
      fields: {
        label: { type: "text" },
        page: { type: "relation", collection: "pages", onDelete },
      },
    }) as const;
  const make = () =>
    defineCms({
      collections: {
        pages: { fields: { title: { type: "text" } } },
        menus: {
          fields: {
            links: {
              type: "array",
              fields: {
                label: { type: "text" },
                page: { type: "relation", collection: "pages" },
                also: { type: "relation", collection: "pages", many: true },
                subs: {
                  type: "array",
                  fields: { page: { type: "relation", collection: "pages" } },
                },
              },
            },
          },
        },
        strict: { fields: { links: link("restrict") } },
        owned: { fields: { links: link("cascade") } },
      },
      globals: { nav: { fields: { links: link("set-null") } } },
      database: { url: ":memory:" },
      secret: "x".repeat(32),
      media: false,
    });

  it("set-null clears the field in every item that holds it and keeps the items", async () => {
    const cms = make();
    const [p, q] = [await cms.create("pages", {}), await cms.create("pages", {})];
    const menu = await cms.create("menus", {
      links: [
        { label: "a", page: p.id, also: [p.id, q.id], subs: [{ page: q.id }, { page: p.id }] },
        { label: "b", page: q.id },
        { label: "c", page: p.id },
      ],
    });
    await cms.delete("pages", p.id);
    expect((await cms.findById("menus", menu.id, ids0))?.links).toMatchObject([
      { label: "a", page: null, also: [q.id], subs: [{ page: q.id }, { page: null }] },
      { label: "b", page: q.id },
      { label: "c", page: null },
    ]);
  });

  it("restrict from inside an item answers 409", async () => {
    const { cms, client } = setup(make());
    await client.signUp(admin);
    const p = await cms.create("pages", {});
    await cms.create("strict", { links: [{ label: "x" }, { page: p.id }] });
    expect(await status(client.delete("pages", p.id))).toBe(409);
    expect(await cms.findById("pages", p.id)).toBeTruthy();
  });

  it("cascade from inside an item deletes the owner", async () => {
    const cms = make();
    const p = await cms.create("pages", {});
    await cms.create("owned", { links: [{ label: "x" }, { page: p.id }] });
    await cms.delete("pages", p.id);
    expect(await cms.find("owned")).toEqual([]);
  });

  it("set-null clears items of a global", async () => {
    const cms = make();
    const p = await cms.create("pages", {});
    await cms.setGlobal("nav", { links: [{ page: p.id }, { label: "x" }] });
    await cms.delete("pages", p.id);
    expect((await cms.getGlobal("nav", ids0)).links).toMatchObject([
      { page: null },
      { label: "x" },
    ]);
  });

  it("set-null clears items in localized published data and in a pending locale draft", async () => {
    const cms = defineCms({
      collections: {
        pages: { fields: { title: { type: "text" } } },
        menus: { localized: true, fields: { links: link("set-null") } },
      },
      localization: { locales: ["en", "de"], defaultLocale: "en" },
      database: { url: ":memory:" },
      secret: "",
      media: false,
    });
    const p = await cms.create("pages", {});
    const menu = await cms.create("menus", { links: [{ label: "en", page: p.id }] });
    await cms.update("menus", menu.id, { links: [{ label: "de", page: p.id }] }, {
      draft: true,
      locale: "de",
    } as never);
    await cms.delete("pages", p.id);

    const read = (locale: "en" | "de") =>
      cms.withDrafts().findById("menus", menu.id, { locale, fallback: false, populate: false });
    expect((await read("en"))?.links).toMatchObject([{ label: "en", page: null }]);
    expect(await read("de")).toMatchObject({
      links: [{ label: "de", page: null }],
      hasDraft: true,
    });
  });
});

describe("onDelete inside block items", () => {
  const ids0 = { populate: false } as const;
  const make = (url = ":memory:") =>
    defineCms({
      collections: {
        pages: { fields: { title: { type: "text" } } },
        posts: { fields: { title: { type: "text" } } },
        landing: {
          fields: {
            content: {
              type: "blocks",
              blocks: {
                link: {
                  fields: {
                    ref: { type: "relation", collection: "pages", onDelete: "set-null" },
                    also: { type: "relation", collection: "pages", many: true },
                  },
                },
                post: {
                  fields: { ref: { type: "relation", collection: "posts", onDelete: "restrict" } },
                },
                strict: {
                  fields: { page: { type: "relation", collection: "pages", onDelete: "restrict" } },
                },
                owned: {
                  fields: { page: { type: "relation", collection: "pages", onDelete: "cascade" } },
                },
              },
            },
          },
        },
      },
      database: { url },
      secret: "x".repeat(32),
      media: false,
    });

  it("set-null clears the field in every block item that holds it", async () => {
    const cms = make();
    const [p, q] = [await cms.create("pages", {}), await cms.create("pages", {})];
    const doc = await cms.create("landing", {
      content: [
        { blockType: "link", ref: p.id, also: [p.id, q.id] },
        { blockType: "link", ref: q.id },
      ],
    });
    await cms.delete("pages", p.id);
    expect((await cms.findById("landing", doc.id, ids0))?.content).toMatchObject([
      { blockType: "link", ref: null, also: [q.id] },
      { blockType: "link", ref: q.id },
    ]);
  });

  it("restrict from a block item answers 409", async () => {
    const { cms, client } = setup(make());
    await client.signUp(admin);
    const p = await cms.create("pages", {});
    await cms.create("landing", { content: [{ blockType: "strict", page: p.id }] });
    expect(await status(client.delete("pages", p.id))).toBe(409);
  });

  it("cascade from a block item deletes the owner", async () => {
    const cms = make();
    const p = await cms.create("pages", {});
    await cms.create("landing", { content: [{ blockType: "owned", page: p.id }] });
    await cms.delete("pages", p.id);
    expect(await cms.find("landing")).toEqual([]);
  });

  it("leaves a relation of another block under the same key alone", async () => {
    const url = tmpDb();
    const cms = make(url);
    const [p, post] = [await cms.create("pages", {}), await cms.create("posts", {})];
    const doc = await cms.create("landing", {
      content: [
        { blockType: "link", ref: p.id },
        { blockType: "post", ref: post.id },
      ],
    });
    // The `post` block's relation holds the page's id, so only the block filter tells them apart.
    const db = createLibsql({ url });
    await db.execute({
      sql: "UPDATE cms_documents SET data = json_set(data, '$.content[1].ref', ?) WHERE id = ?",
      args: [p.id, doc.id],
    });
    db.close();
    await cms.delete("pages", p.id);
    expect((await cms.findById("landing", doc.id, ids0))?.content).toMatchObject([
      { blockType: "link", ref: null },
      { blockType: "post", ref: p.id },
    ]);
  });
});
