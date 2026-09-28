import { beforeEach, describe, expect, it } from "vitest";
import { CmsError } from "../client.ts";
import { ConflictError, defineCms } from "../index.ts";
import { seo } from "../presets/index.ts";
import { admin, fresh, relational, seed, setup, status, type Env } from "./setup.ts";

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
    await cms.delete("media", m.id);
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
