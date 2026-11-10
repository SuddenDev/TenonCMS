import { beforeEach, describe, expect, it } from "vitest";
import { ConflictError, ValidationError } from "../errors.ts";
import { defineCms } from "../index.ts";
import {
  admin,
  localized,
  origin,
  setup,
  status,
  testDatabase,
  testDb,
  withAdmin,
} from "./setup.ts";

const editor = { name: "Ed", email: "e@b.co", password: "password123" };

// `previousDoc` of each `afterChange` call on `posts`.
let previous: Array<Record<string, any> | undefined>;

const make = (database = testDatabase()) =>
  defineCms({
    collections: {
      posts: {
        fields: {
          title: { type: "text", required: true },
          slug: { type: "text", unique: true },
        },
        hooks: {
          afterChange: [
            ({ previousDoc }: { previousDoc?: Record<string, any> }) => {
              previous.push(previousDoc);
            },
          ],
        },
      },
      locked: { fields: { title: { type: "text" } }, access: { update: ["admin"] } },
      logs: { drafts: false, fields: { text: { type: "text" } } },
    },
    globals: {
      site: { fields: { name: { type: "text" } } },
      flags: { drafts: false, fields: { on: { type: "boolean" } } },
    },
    media: false,
    settings: false,
    database,
    secret: "x".repeat(32),
  });

const errors = (promise: Promise<unknown>) =>
  promise.then(
    () => undefined,
    (e: unknown) => (e instanceof ValidationError ? e.errors : e),
  );

describe("unpublish", () => {
  let cms: ReturnType<typeof make>;
  beforeEach(() => {
    previous = [];
    cms = make();
  });

  it("hides the document from the published read and keeps its data as the draft", async () => {
    const doc = await cms.create("posts", { title: "Live" });
    const result = await cms.unpublish("posts", doc.id);

    expect(result).toMatchObject({ title: "Live", publishedAt: null, hasDraft: true });
    expect(await cms.findById("posts", doc.id)).toBeUndefined();
    expect(await cms.find("posts")).toEqual([]);
    expect(await cms.withDrafts().findById("posts", doc.id)).toMatchObject({
      title: "Live",
      publishedAt: null,
      hasDraft: true,
    });
  });

  it("keeps an existing draft", async () => {
    const doc = await cms.create("posts", { title: "Live" });
    await cms.update("posts", doc.id, { title: "Next" }, { draft: true });

    expect(await cms.unpublish("posts", doc.id)).toMatchObject({
      title: "Next",
      publishedAt: null,
    });
    expect(await cms.withDrafts().findById("posts", doc.id)).toMatchObject({ title: "Next" });
  });

  it("publishes the draft again", async () => {
    const doc = await cms.create("posts", { title: "Live" });
    await cms.unpublish("posts", doc.id);

    expect(await cms.publish("posts", doc.id)).toMatchObject({ title: "Live", hasDraft: false });
    expect(await cms.findById("posts", doc.id)).toMatchObject({ title: "Live" });
  });

  it("does nothing for a document that is not published", async () => {
    const doc = await cms.create("posts", { title: "A" }, { draft: true });
    expect(await cms.unpublish("posts", doc.id)).toMatchObject({
      title: "A",
      publishedAt: null,
      hasDraft: true,
    });
    expect(previous).toEqual([]);
  });

  it("returns undefined for a missing document", async () => {
    expect(await cms.unpublish("posts", "missing")).toBeUndefined();
  });

  it("keeps the slug reserved and available to the document", async () => {
    const doc = await cms.create("posts", { title: "A", slug: "a" });
    await cms.unpublish("posts", doc.id);

    expect(await errors(cms.create("posts", { title: "B", slug: "a" }))).toHaveProperty("slug");
    expect(await cms.publish("posts", doc.id)).toMatchObject({ slug: "a" });
  });

  it("runs afterChange with the published document as previousDoc", async () => {
    const doc = await cms.create("posts", { title: "Live" });
    await cms.update("posts", doc.id, { title: "Next" }, { draft: true });
    previous = [];

    await cms.unpublish("posts", doc.id);
    expect(previous).toHaveLength(1);
    expect(previous[0]).toMatchObject({ title: "Live", hasDraft: true });
    expect(previous[0]?.publishedAt).toEqual(expect.any(String));
  });

  it("deletes the document when the draft is discarded afterwards", async () => {
    const doc = await cms.create("posts", { title: "Live" });
    await cms.unpublish("posts", doc.id);

    expect(await cms.discard("posts", doc.id)).toBeUndefined();
    expect(await cms.withDrafts().findById("posts", doc.id)).toBeUndefined();
  });

  it("rejects drafts where they are off", async () => {
    const log = await cms.create("logs", { text: "a" });
    expect(await errors(cms.unpublish("logs", log.id))).toEqual({
      "": 'Drafts are off for "logs"',
    });
    expect(await errors(cms.unpublishGlobal("flags"))).toEqual({
      "": 'Drafts are off for "flags"',
    });
  });

  it("unpublishes a global", async () => {
    await cms.setGlobal("site", { name: "Live" });
    await cms.setGlobal("site", { name: "Next" }, { draft: true });
    previous = [];

    expect(await cms.unpublishGlobal("site")).toMatchObject({
      name: "Next",
      publishedAt: null,
      hasDraft: true,
    });
    expect(await cms.getGlobal("site")).toEqual({ publishedAt: null, hasDraft: false });
    expect(await cms.withDrafts().getGlobal("site")).toMatchObject({ name: "Next" });
    expect(await cms.publishGlobal("site")).toMatchObject({ name: "Next" });
  });

  it("does nothing for a global that is not published", async () => {
    expect(await cms.unpublishGlobal("site")).toEqual({ publishedAt: null, hasDraft: false });
    await cms.setGlobal("site", { name: "A" }, { draft: true });
    expect(await cms.unpublishGlobal("site")).toMatchObject({ name: "A", publishedAt: null });
  });

  it("refuses a stale updatedAt and accepts the current one", async () => {
    const doc = await cms.create("posts", { title: "Live" });
    const stale = { updatedAt: doc.updatedAt };
    await new Promise((resolve) => setTimeout(resolve, 2));
    await cms.update("posts", doc.id, { title: "Next" }, { draft: true });

    await expect(cms.unpublish("posts", doc.id, stale)).rejects.toBeInstanceOf(ConflictError);
    expect(await cms.findById("posts", doc.id)).toMatchObject({ title: "Live" });

    const current = await cms.withDrafts().findById("posts", doc.id);
    expect(await cms.unpublish("posts", doc.id, { updatedAt: current!.updatedAt })).toMatchObject({
      publishedAt: null,
    });
    expect(previous).toHaveLength(2);

    await new Promise((resolve) => setTimeout(resolve, 2));
    await cms.setGlobal("site", { name: "A" });
    const global = await cms.getGlobal("site");
    await new Promise((resolve) => setTimeout(resolve, 2));
    await cms.setGlobal("site", { name: "B" });
    await expect(
      cms.unpublishGlobal("site", { updatedAt: global.updatedAt }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  describe("versions", () => {
    const signedIn = async () => {
      const s = setup(cms);
      await s.client.signUp(admin);
      return s.client;
    };

    it("records an unpublished version with the content that went offline", async () => {
      const client = await signedIn();
      const doc = await client.create("posts", { title: "Live" });
      await client.updateDraft("posts", doc.id, { title: "Next" });
      await client.unpublish("posts", doc.id);

      const versions = await client.versions("posts", doc.id);
      expect(versions.map((v) => v.status)).toEqual(["unpublished", "draft", "published"]);
      expect(versions[0]).toMatchObject({ locale: null, user: { name: "Admin" } });
      expect(await client.version("posts", doc.id, versions[0].id)).toMatchObject({
        data: { title: "Live" },
      });
    });

    it("records none for a document that is not published", async () => {
      const client = await signedIn();
      const doc = await client.createDraft("posts", { title: "A" });
      await client.unpublish("posts", doc.id);
      expect((await client.versions("posts", doc.id)).map((v) => v.status)).toEqual(["draft"]);
    });

    it("never merges a draft save into it", async () => {
      const client = await signedIn();
      const doc = await client.create("posts", { title: "Live" });
      await client.unpublish("posts", doc.id);
      await client.updateDraft("posts", doc.id, { title: "Next" });
      await client.unpublish("posts", doc.id);
      await client.publish("posts", doc.id);
      await client.unpublish("posts", doc.id);

      expect((await client.versions("posts", doc.id)).map((v) => v.status)).toEqual([
        "unpublished",
        "published",
        "draft",
        "unpublished",
        "published",
      ]);
    });

    it("restores like any other version, as the draft", async () => {
      const client = await signedIn();
      const doc = await client.create("posts", { title: "Live" });
      await client.unpublish("posts", doc.id);
      await client.updateDraft("posts", doc.id, { title: "Next" });
      const versions = await client.versions("posts", doc.id);
      const version = versions.find((v) => v.status === "unpublished")!;

      expect(await client.restoreVersion("posts", doc.id, version.id)).toMatchObject({
        title: "Live",
        publishedAt: null,
        hasDraft: true,
      });
    });

    it("keeps no more than maxVersions", async () => {
      const capped = defineCms({
        collections: { capped: { maxVersions: 2, fields: { title: { type: "text" } } } },
        media: false,
        settings: false,
        database: testDatabase(),
        secret: "x".repeat(32),
      });
      const s = setup(capped);
      await s.client.signUp(admin);
      const doc = await s.client.create("capped", { title: "A" });
      await s.client.update("capped", doc.id, { title: "B" });
      await s.client.unpublish("capped", doc.id);
      expect((await s.client.versions("capped", doc.id)).map((v) => v.status)).toEqual([
        "unpublished",
        "published",
      ]);
    });
  });

  describe("over HTTP", () => {
    const call = (s: ReturnType<typeof setup>, method: string, path: string) =>
      s.fetch(`${origin}/_tenon${path}`, { method });

    it("needs a session", async () => {
      const s = setup(cms);
      expect((await call(s, "POST", "/collections/posts/x/unpublish")).status).toBe(401);
      expect((await call(s, "POST", "/globals/site/unpublish")).status).toBe(401);
    });

    it("has routes and client methods", async () => {
      const s = setup(cms);
      await s.client.signUp(admin);
      const doc = await s.client.create("posts", { title: "A" });

      const res = await call(s, "POST", `/collections/posts/${doc.id}/unpublish`);
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ title: "A", publishedAt: null, hasDraft: true });
      expect(await s.client.find("posts")).toEqual([]);
      expect((await call(s, "POST", "/collections/posts/missing/unpublish")).status).toBe(404);
      expect((await call(s, "POST", `/collections/logs/${doc.id}/unpublish`)).status).toBe(400);

      await s.client.publish("posts", doc.id);
      expect(await s.client.unpublish("posts", doc.id)).toMatchObject({ publishedAt: null });

      await s.client.setGlobal("site", { name: "S" });
      expect(await s.client.unpublishGlobal("site")).toMatchObject({
        name: "S",
        publishedAt: null,
      });
      expect((await call(s, "POST", "/globals/flags/unpublish")).status).toBe(400);
    });

    it("answers 409 for a stale updatedAt", async () => {
      const s = setup(cms);
      await s.client.signUp(admin);
      const doc = await s.client.create("posts", { title: "A" });
      await new Promise((resolve) => setTimeout(resolve, 2));
      await s.client.update("posts", doc.id, { title: "B" });

      const path = `/collections/posts/${doc.id}/unpublish`;
      const stale = await call(s, "POST", `${path}?updatedAt=${encodeURIComponent(doc.updatedAt)}`);
      expect(stale.status).toBe(409);
      expect(await status(s.client.unpublish("posts", doc.id, { updatedAt: doc.updatedAt }))).toBe(
        409,
      );

      const current = await s.client.findById("posts", doc.id);
      expect(
        await s.client.unpublish("posts", doc.id, { updatedAt: current!.updatedAt }),
      ).toMatchObject({ publishedAt: null });
    });

    it("needs the update rule", async () => {
      const env = await withAdmin(cms);
      await env.create(editor);
      const doc = await env.client.create("locked", { title: "A" });
      const other = setup(env.cms);
      await other.client.signIn(editor);

      expect(await status(other.client.unpublish("locked", doc.id))).toBe(403);
      expect(await env.client.unpublish("locked", doc.id)).toMatchObject({ publishedAt: null });
    });
  });
});

describe("unpublish in a localized entry", () => {
  const de = { locale: "de" } as never;
  let db: ReturnType<typeof testDb>;
  let s: ReturnType<typeof localized>;
  beforeEach(() => {
    db = testDb();
    s = localized({ database: db.database });
  });
  const strict = (locale: string) => ({ locale, fallback: false }) as never;

  // Reading once connects and migrates, so the tables exist.
  const sharedPublishedAt = async (id: string) => {
    await s.cms.find("authors");
    return (await db.exec(`SELECT published_at FROM cms_documents WHERE id = ?`, [id]))[0]
      .published_at;
  };

  it("unpublishes one locale and keeps the others", async () => {
    const { cms } = s;
    const post = await cms.create("posts", { title: "Hello", slug: "hi" });
    await cms.update("posts", post.id, { title: "Hallo" }, de);

    const result = await cms.unpublish("posts", post.id, de);
    expect(result).toMatchObject({ title: "Hallo", publishedAt: null, hasDraft: true });
    expect(await cms.findById("posts", post.id, strict("de"))).toBeUndefined();
    expect(await cms.findById("posts", post.id)).toMatchObject({ title: "Hello" });
    expect(await sharedPublishedAt(post.id)).not.toBeNull();

    expect(await cms.publish("posts", post.id, de)).toMatchObject({ title: "Hallo" });
    expect(await cms.findById("posts", post.id, strict("de"))).toMatchObject({ title: "Hallo" });
  });

  it("unpublishes the shared row with the last published locale", async () => {
    const { cms } = s;
    const post = await cms.create("posts", { title: "Hello", slug: "hi", views: 3 });
    await cms.update("posts", post.id, { title: "Hallo" }, de);

    await cms.unpublish("posts", post.id, de);
    expect(await sharedPublishedAt(post.id)).not.toBeNull();
    await cms.unpublish("posts", post.id);

    expect(await sharedPublishedAt(post.id)).toBeNull();
    expect(await cms.find("posts")).toEqual([]);
    expect(await cms.withDrafts().findById("posts", post.id)).toMatchObject({
      title: "Hello",
      views: 3,
      publishedAt: null,
      hasDraft: true,
    });

    await cms.publish("posts", post.id);
    expect(await cms.findById("posts", post.id)).toMatchObject({ title: "Hello", views: 3 });
  });

  it("does nothing for a locale that is not published", async () => {
    const { cms } = s;
    const post = await cms.create("posts", { title: "Hello" });
    await cms.update("posts", post.id, { title: "Hallo" }, { draft: true, locale: "de" } as never);

    await cms.unpublish("posts", post.id, de);
    expect(await cms.findById("posts", post.id)).toMatchObject({ title: "Hello" });
    expect(await sharedPublishedAt(post.id)).not.toBeNull();
  });

  it("records the version in the locale that went offline", async () => {
    const { cms, client } = s;
    await client.signUp(admin);
    const post = await cms.create("posts", { title: "Hello" });
    await cms.update("posts", post.id, { title: "Hallo" }, de);
    await cms.unpublish("posts", post.id, de);

    const versions = await client.versions("posts", post.id, de);
    expect(versions[0]).toMatchObject({ status: "unpublished", locale: "de" });
    expect(await client.version("posts", post.id, versions[0].id)).toMatchObject({
      data: { title: "Hallo" },
    });
    expect((await client.versions("posts", post.id)).map((v) => v.status)).not.toContain(
      "unpublished",
    );
  });

  it("unpublishes a global per locale", async () => {
    const { cms } = s;
    await cms.setGlobal("site", { tagline: "Hi", email: "a@b.co" });
    await cms.setGlobal("site", { tagline: "Hallo" }, de);

    await cms.unpublishGlobal("site", de);
    expect(await cms.getGlobal("site", strict("de"))).toMatchObject({ publishedAt: null });
    expect(await cms.getGlobal("site")).toMatchObject({ tagline: "Hi" });

    await cms.unpublishGlobal("site");
    expect(await cms.getGlobal("site")).toMatchObject({ publishedAt: null, hasDraft: false });
    expect(await cms.withDrafts().getGlobal("site")).toMatchObject({
      tagline: "Hi",
      email: "a@b.co",
    });
  });

  it("works over HTTP with ?locale=", async () => {
    const { cms, fetchWithSession, client } = s;
    await client.signUp(admin);
    const post = await cms.create("posts", { title: "Hello" });
    await cms.update("posts", post.id, { title: "Hallo" }, de);

    const res = await fetchWithSession(`/collections/posts/${post.id}/unpublish?locale=de`, {
      method: "POST",
    });
    expect(res.status).toBe(200);
    expect(await cms.findById("posts", post.id, strict("de"))).toBeUndefined();
    expect(await cms.findById("posts", post.id)).toMatchObject({ title: "Hello" });
    expect(await client.unpublish("posts", post.id, de)).toMatchObject({ locale: "de" });
  });
});
