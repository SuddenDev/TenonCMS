import { describe, expect, it } from "vitest";
import { defineCms } from "../index.ts";
import { ConflictError, ValidationError } from "../errors.ts";
import { base, testDatabase, testDb, withAdmin } from "./setup.ts";

const localization = { locales: ["en", "de"], defaultLocale: "en" } as const;
const de = { locale: "de" } as const;
const raw = { populate: false, fallback: false } as const;

const blocks = {
  type: "blocks",
  blocks: {
    hero: {
      fields: {
        heading: { type: "text" },
        author: { type: "relation", collection: "authors", onDelete: "restrict" },
      },
    },
    text: { fields: { body: { type: "text" } } },
    columns: {
      fields: {
        left: { type: "blocks", blocks: { text: { fields: { body: { type: "text" } } } } },
      },
    },
  },
} as const;

const schema = (extra: Record<string, unknown> = {}) => ({
  localization,
  database: testDatabase(),
  secret: base.secret,
  media: false,
  collections: {
    authors: { fields: { name: { type: "text" } } },
    pages: { localized: true, fields: { title: { type: "text" }, content: blocks } },
    posts: {
      localized: true,
      syncStructure: false,
      fields: { title: { type: "text" }, content: blocks },
    },
    plain: { localized: true, drafts: false, fields: { content: blocks } },
    strict: {
      localized: true,
      fields: {
        content: {
          type: "blocks",
          blocks: { text: { fields: { body: { type: "text", required: true } } } },
        },
      },
    },
  },
  globals: {
    menu: {
      localized: true,
      fields: { items: { type: "array", fields: { label: { type: "text" } } } },
    },
  },
  ...extra,
});

const make = (extra?: Record<string, unknown>) => defineCms(schema(extra) as never) as any;

const ids = (doc: any, key = "content") => doc[key].map((i: any) => i.id);

describe("same structure in all languages", () => {
  it("shares items between languages and keeps values per language", async () => {
    const cms = make();
    const page = await cms.create("pages", { content: [{ blockType: "hero", heading: "Hello" }] });
    const [hero] = page.content;
    await cms.update(
      "pages",
      page.id,
      {
        content: [
          { ...hero, heading: "Hallo" },
          { blockType: "text", body: "Neu" },
        ],
      },
      de,
    );

    const en = await cms.findById("pages", page.id, raw);
    const ger = await cms.findById("pages", page.id, { ...raw, ...de });
    expect(en.content).toEqual([
      { id: hero.id, blockType: "hero", heading: "Hello", author: null },
      { id: expect.any(String), blockType: "text", body: null },
    ]);
    expect(ger.content.map((i: any) => i.heading ?? i.body)).toEqual(["Hallo", "Neu"]);
    expect(en).toMatchObject({ syncStructure: true, syncStructureDefault: true });
  });

  it("falls back field by field to the default language", async () => {
    const cms = make();
    const page = await cms.create("pages", { content: [{ blockType: "hero", heading: "Hello" }] });
    const ger = await cms.findById("pages", page.id, { ...de, populate: false });
    expect(ger.content).toEqual([{ ...page.content[0], heading: "Hello" }]);
  });

  it("removes an item in every language and drops its values on the next save", async () => {
    const { database, exec } = testDb();
    const cms = make({ database });
    const page = await cms.create("pages", {
      content: [
        { blockType: "text", body: "A" },
        { blockType: "text", body: "B" },
      ],
    });
    const [a, b] = page.content;
    await cms.update(
      "pages",
      page.id,
      {
        content: [
          { ...a, body: "A-de" },
          { ...b, body: "B-de" },
        ],
      },
      de,
    );
    await cms.update("pages", page.id, { content: [a] });

    expect(ids(await cms.findById("pages", page.id, { ...raw, ...de }))).toEqual([a.id]);
    const row = async () =>
      JSON.parse(
        (
          await exec(
            "SELECT data FROM cms_document_locales WHERE document_id = ? AND locale = 'de'",
            [page.id],
          )
        )[0].data,
      );
    expect(Object.keys((await row()).content)).toEqual([a.id, b.id]);
    await cms.update("pages", page.id, { title: "Seite" }, de);
    expect(Object.keys((await row()).content)).toEqual([a.id]);
  });

  it("shares a nested structure", async () => {
    const cms = make();
    const page = await cms.create("pages", {
      content: [{ blockType: "columns", left: [{ blockType: "text", body: "L" }] }],
    });
    const [col] = page.content;
    await cms.update(
      "pages",
      page.id,
      { content: [{ ...col, left: [...col.left, { blockType: "text", body: "L2" }] }] },
      de,
    );
    const en = await cms.findById("pages", page.id, raw);
    expect(en.content[0].left.map((i: any) => i.body)).toEqual(["L", null]);
  });

  it("keeps a list per language for a separate document", async () => {
    const cms = make();
    const post = await cms.create("posts", { content: [{ blockType: "text", body: "A" }] });
    await cms.update("posts", post.id, { content: [{ blockType: "text", body: "X" }] }, de);
    expect((await cms.findById("posts", post.id, raw)).content[0].body).toBe("A");
    expect(await cms.findById("posts", post.id, raw)).toMatchObject({ syncStructure: false });
  });

  it("resolves relations inside synced items per language", async () => {
    const cms = make();
    const anna = await cms.create("authors", { name: "Anna" });
    const bert = await cms.create("authors", { name: "Bert" });
    const page = await cms.create("pages", { content: [{ blockType: "hero", author: anna.id }] });
    await cms.update("pages", page.id, { content: [{ ...page.content[0], author: bert.id }] }, de);
    expect((await cms.findById("pages", page.id)).content[0].author.name).toBe("Anna");
    expect((await cms.findById("pages", page.id, de)).content[0].author.name).toBe("Bert");
  });

  it("applies onDelete to references inside synced items of every language", async () => {
    const cms = make();
    const anna = await cms.create("authors", { name: "Anna" });
    const bert = await cms.create("authors", { name: "Bert" });
    const page = await cms.create("pages", { content: [{ blockType: "hero", heading: "x" }] });
    await cms.update("pages", page.id, { content: [{ ...page.content[0], author: bert.id }] }, de);
    await cms.delete("authors", anna.id);
    await expect(cms.delete("authors", bert.id)).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("switching", () => {
  async function separate(cms: any) {
    const post = await cms.create("posts", {
      content: [
        { blockType: "text", body: "A" },
        { blockType: "text", body: "B" },
      ],
    });
    const [a] = post.content;
    await cms.update(
      "posts",
      post.id,
      {
        content: [
          { ...a, body: "A-de" },
          { blockType: "text", body: "C-de" },
        ],
      },
      de,
    );
    return post;
  }

  it("turns on from German: English shows the German structure", async () => {
    const cms = make();
    const post = await separate(cms);
    const [a, b] = post.content;

    const counts = await cms.setSyncStructure("posts", post.id, true, { ...de, dryRun: true });
    expect(counts).toEqual({ en: { removed: 1, added: 1 }, de: { removed: 0, added: 0 } });
    expect((await cms.findById("posts", post.id, raw)).syncStructure).toBe(false);

    const doc = await cms.setSyncStructure("posts", post.id, true, de);
    expect(doc).toMatchObject({ syncStructure: true, syncStructureDefault: false, locale: "de" });
    const en = await cms.withDrafts().findById("posts", post.id, raw);
    expect(en.content.map((i: any) => i.body)).toEqual(["A", null]);
    expect(ids(en)).not.toContain(b.id);
    expect(ids(en)[0]).toBe(a.id);
  });

  it("turns off and on again: items of other languages come back", async () => {
    const cms = make();
    const post = await separate(cms);
    await cms.setSyncStructure("posts", post.id, true, de);
    await cms.setSyncStructure("posts", post.id, false, de);
    const en = await cms.withDrafts().findById("posts", post.id, raw);
    expect(en.content.map((i: any) => i.body)).toEqual(["A", "B"]);
    expect(en).toMatchObject({ syncStructure: false, syncStructureDefault: false });
  });

  it("turns off: a language that saved by id keeps what it showed", async () => {
    const cms = make();
    const page = await cms.create("plain", { content: [{ blockType: "text", body: "A" }] });
    await cms.update(
      "plain",
      page.id,
      { content: [...page.content, { blockType: "text", body: "B-de" }] },
      de,
    );
    await cms.setSyncStructure("plain", page.id, false);
    const before = await cms.findById("plain", page.id, { ...raw, ...de });
    expect(before.content.map((i: any) => i.body)).toEqual(["A", "B-de"]);

    await cms.update("plain", page.id, {}, de);
    await cms.update("plain", page.id, { content: [] });
    const after = await cms.findById("plain", page.id, { ...raw, ...de });
    expect(after.content.map((i: any) => i.body)).toEqual(["A", "B-de"]);
  });

  it("follows the collection with default", async () => {
    const cms = make();
    const post = await separate(cms);
    await cms.setSyncStructure("posts", post.id, true, de);
    const doc = await cms.setSyncStructure("posts", post.id, "default");
    expect(doc).toMatchObject({ syncStructure: false, syncStructureDefault: true });
  });

  it("saves a switch as a shared draft that publishing makes live", async () => {
    const cms = make();
    const post = await separate(cms);
    await cms.setSyncStructure("posts", post.id, true, de);
    expect((await cms.findById("posts", post.id, raw)).syncStructure).toBe(false);
    await cms.publish("posts", post.id);
    expect((await cms.findById("posts", post.id, raw)).syncStructure).toBe(true);
  });

  it("saves at once without drafts", async () => {
    const cms = make();
    const doc = await cms.create("plain", { content: [{ blockType: "text", body: "A" }] });
    await cms.setSyncStructure("plain", doc.id, false);
    expect((await cms.findById("plain", doc.id, raw)).syncStructure).toBe(false);
  });

  it("switches a global", async () => {
    const cms = make();
    await cms.setGlobal("menu", { items: [{ label: "Home" }] });
    const doc = await cms.setGlobalSyncStructure("menu", false, de);
    expect(doc).toMatchObject({ syncStructure: false, syncStructureDefault: false });
  });

  it("refuses an entry without a structure", async () => {
    const cms = make();
    const author = await cms.create("authors", { name: "A" });
    await expect(cms.setSyncStructure("authors", author.id, true)).rejects.toBeInstanceOf(
      ValidationError,
    );
  });
});

describe("drafts", () => {
  it("shares a structure change as a shared draft, and a values-only draft as none", async () => {
    const cms = make();
    const page = await cms.create("pages", { content: [{ blockType: "text", body: "A" }] });
    await cms.update(
      "pages",
      page.id,
      { content: [{ ...page.content[0], body: "A-de" }] },
      { ...de, draft: true },
    );
    expect((await cms.withDrafts().findById("pages", page.id, raw)).sharedDraft).toBe(false);

    await cms.update(
      "pages",
      page.id,
      { content: [...page.content, { blockType: "text", body: "B-de" }] },
      { ...de, draft: true },
    );
    const en = await cms.withDrafts().findById("pages", page.id, raw);
    expect(en.sharedDraft).toBe(true);
    expect(en.content).toHaveLength(2);
    expect((await cms.findById("pages", page.id, raw)).content).toHaveLength(1);

    await cms.publish("pages", page.id);
    expect((await cms.findById("pages", page.id, raw)).content).toHaveLength(2);
  });

  it("checks required values only for the language being published", async () => {
    const cms = make();
    const doc = await cms.create("strict", { content: [{ blockType: "text", body: "A" }] });
    const [a] = doc.content;
    await cms.update(
      "strict",
      doc.id,
      {
        content: [
          { ...a, body: "A-de" },
          { blockType: "text", body: "B-de" },
        ],
      },
      { ...de, draft: true },
    );
    await expect(cms.publish("strict", doc.id)).rejects.toMatchObject({
      errors: { "content.1.body": expect.any(String) },
    });
    await expect(cms.publish("strict", doc.id, de)).resolves.toBeDefined();
  });
});

describe("other operations", () => {
  it("copies the values of a synced document", async () => {
    const cms = make();
    const page = await cms.create("pages", { content: [{ blockType: "text", body: "A" }] });
    await cms.copyLocale("pages", page.id, { from: "en", to: "de" });
    const ger = await cms.withDrafts().findById("pages", page.id, { ...raw, ...de });
    expect(ger.content).toEqual(page.content);
  });

  it("restores a version through the current state", async () => {
    const env = await withAdmin(make({ database: testDatabase() }));
    const client = env.client as any;
    const page = await client.create("pages", { content: [{ blockType: "text", body: "A" }] });
    await client.update("pages", page.id, { content: [] });
    const [, first] = await client.versions("pages", page.id);
    const restored = await client.restoreVersion("pages", page.id, first.id);
    expect(restored.content.map((i: any) => i.body)).toEqual(["A"]);
  });
});

describe("translations setting", () => {
  it("lists the entries with a structure and their code defaults", async () => {
    const cms = make();
    const g = cms.schema.globals.translations;
    expect(Object.keys(g.fields)).toEqual(["pages", "posts", "plain", "strict", "menu"]);
    expect(g.fields.posts.default).toBe(false);
    expect(g.localized).toBeUndefined();
  });

  it("sets the state of documents that follow the collection", async () => {
    const cms = make();
    const page = await cms.create("pages", { content: [{ blockType: "text", body: "A" }] });
    await cms.setGlobal("translations", { pages: false });
    expect((await cms.findById("pages", page.id, raw)).syncStructure).toBe(false);
    await cms.update("pages", page.id, { content: [{ blockType: "text", body: "X" }] }, de);
    expect((await cms.findById("pages", page.id, raw)).content[0].body).toBe("A");
  });

  it("applies the default to every document, with a dry run first", async () => {
    const cms = make();
    const post = await cms.create("posts", { content: [{ blockType: "text", body: "A" }] });
    await cms.update("posts", post.id, { content: [{ blockType: "text", body: "X" }] }, de);
    await cms.setSyncStructure("posts", post.id, false);
    await cms.setGlobal("translations", { posts: true });

    expect(await cms.applySyncStructure("posts", { dryRun: true })).toEqual({
      documents: 1,
      locales: { en: { removed: 0, added: 0 }, de: { removed: 1, added: 1 } },
    });
    await cms.applySyncStructure("posts");
    const ger = await cms.withDrafts().findById("posts", post.id, { ...raw, ...de });
    expect(ger).toMatchObject({ syncStructure: true, syncStructureDefault: true });
    expect(ids(ger)).toEqual(ids(post));
  });

  it("is missing with settings.translations false", () => {
    const cms = make({ settings: { translations: false } });
    expect(cms.schema.globals.translations).toBeUndefined();
  });
});

describe("access", () => {
  const restricted = () =>
    make({
      collections: {
        ...schema().collections,
        pages: {
          ...schema().collections.pages,
          access: { update: ({ user }: any) => (user ? { title: "open" } : false) },
        },
      },
    });

  it("needs update on the document", async () => {
    const cms = restricted();
    const doc = await cms.create("pages", { title: "locked", content: [] });
    const visitor = await cms.withSession(new Request("http://localhost"));
    await expect(visitor.setSyncStructure("pages", doc.id, false)).rejects.toMatchObject({
      status: 401,
    });
    const client = (await withAdmin(cms)).client as any;
    await expect(client.setSyncStructure("pages", doc.id, false)).rejects.toMatchObject({
      status: 403,
    });
  });

  it("fails applySyncStructure with no writes when one document is denied", async () => {
    const cms = restricted();
    const open = await cms.create("pages", { title: "open", content: [] });
    await cms.create("pages", { title: "locked", content: [] });
    await cms.setSyncStructure("pages", open.id, false);
    const client = (await withAdmin(cms)).client as any;
    await expect(client.applySyncStructure("pages")).rejects.toMatchObject({ status: 403 });
    expect((await cms.withDrafts().findById("pages", open.id, raw)).syncStructureDefault).toBe(
      false,
    );
  });
});

describe("startup", () => {
  it("throws for syncStructure on an entry that is not localized", () => {
    expect(() =>
      make({ collections: { x: { syncStructure: true, fields: { a: { type: "text" } } } } }),
    ).toThrow(/"x" sets syncStructure but is not localized/);
  });

  it("throws for a field named syncStructure", () => {
    expect(() =>
      make({
        collections: { x: { localized: true, fields: { syncStructure: { type: "text" } } } },
      }),
    ).toThrow(/"x.syncStructure" is a reserved field name/);
  });

  it("throws for a host global named translations", () => {
    expect(() => make({ globals: { ...schema().globals, translations: { fields: {} } } })).toThrow(
      /duplicate global "translations"/,
    );
  });
});

describe("over HTTP", () => {
  it("switches, dry-runs and applies", async () => {
    const env = await withAdmin(make());
    const client = env.client as any;
    const post = await client.create("posts", { content: [{ blockType: "text", body: "A" }] });
    expect(
      await client.setSyncStructure("posts", post.id, true, { locale: "de", dryRun: true }),
    ).toEqual({
      en: { removed: 0, added: 0 },
    });
    expect(await client.setSyncStructure("posts", post.id, true)).toMatchObject({
      syncStructure: true,
    });
    expect(await client.applySyncStructure("posts", { dryRun: true })).toMatchObject({
      documents: 1,
    });
    await client.setGlobal("menu", { items: [] });
    expect(await client.setGlobalSyncStructure("menu", false)).toMatchObject({
      syncStructure: false,
    });
  });
});
