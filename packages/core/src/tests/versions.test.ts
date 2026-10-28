import { afterEach, describe, expect, it, vi } from "vitest";
import { defineCms } from "../index.ts";
import { base, fresh, localized, setup, status, withAdmin } from "./setup.ts";

const editor = { name: "Ed", email: "e@b.co", password: "password123" };

/** An admin and a signed-in editor. Editors MAY NOT read `posts.notes`, and nobody MAY update `pages`. */
async function twoEditors() {
  const cms = defineCms({
    ...base,
    collections: {
      posts: {
        fields: {
          ...base.collections.posts.fields,
          notes: { type: "text", access: { read: ["admin"] } },
        },
      },
      pages: { fields: { title: { type: "text" } }, access: { update: () => false } },
      plain: { drafts: false, fields: { title: { type: "text" } } },
      capped: { drafts: false, maxVersions: 2, fields: { title: { type: "text" } } },
    },
  });
  const a = await withAdmin(cms);
  await a.create(editor);
  const b = setup(cms);
  await b.client.signIn(editor);
  return { cms, a: a.client, b: b.client };
}

afterEach(() => vi.useRealTimers());

describe("versions", () => {
  it("record a publish with its user", async () => {
    const { a } = await twoEditors();
    const post = await a.createDraft("posts", { title: "One" });
    await a.publish("posts", post.id);

    const versions = await a.versions("posts", post.id);
    expect(versions.map((v) => v.status)).toEqual(["published", "draft"]);
    expect(versions[0]).toMatchObject({ locale: null, user: { name: "Admin" } });
    expect(await a.version("posts", post.id, versions[0].id)).toMatchObject({
      data: { title: "One" },
    });
  });

  it("merge draft saves of one user until someone else saves or it is published", async () => {
    const { a, b } = await twoEditors();
    const post = await a.createDraft("posts", { title: "One" });
    await a.updateDraft("posts", post.id, { title: "Two" });
    await a.updateDraft("posts", post.id, { title: "Three" });
    expect(await a.versions("posts", post.id)).toHaveLength(1);

    await b.updateDraft("posts", post.id, { title: "Four" });
    await a.publish("posts", post.id);
    await a.updateDraft("posts", post.id, { title: "Five" });

    const versions = await a.versions("posts", post.id);
    expect(versions.map((v) => [v.status, v.user?.name])).toEqual([
      ["draft", "Admin"],
      ["published", "Admin"],
      ["draft", "Ed"],
      ["draft", "Admin"],
    ]);
    expect(await a.version("posts", post.id, versions[3].id)).toMatchObject({
      data: { title: "Three" },
    });
  });

  it("start a new draft version after a break of 30 minutes", async () => {
    const { a } = await twoEditors();
    const post = await a.createDraft("posts", { title: "One" });
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 29 * 60_000);
    await a.updateDraft("posts", post.id, { title: "Two" });
    expect(await a.versions("posts", post.id)).toHaveLength(1);

    vi.setSystemTime(Date.now() + 31 * 60_000);
    await a.updateDraft("posts", post.id, { title: "Three" });
    const versions = await a.versions("posts", post.id);
    expect(versions).toHaveLength(2);
    expect(await a.version("posts", post.id, versions[1].id)).toMatchObject({
      data: { title: "Two" },
    });
  });

  it("record every save without drafts", async () => {
    const { a } = await twoEditors();
    const doc = await a.create("plain", { title: "One" });
    await a.update("plain", doc.id, { title: "Two" });

    expect((await a.versions("plain", doc.id)).map((v) => v.status)).toEqual([
      "published",
      "published",
    ]);
  });

  it("keep the newest 100 per document, or `maxVersions`", async () => {
    const { cms, a } = await twoEditors();
    const doc = await a.create("capped", { title: "One" });
    await a.update("capped", doc.id, { title: "Two" });
    await a.update("capped", doc.id, { title: "Three" });
    const versions = await a.versions("capped", doc.id);
    expect(versions).toHaveLength(2);
    expect(await a.version("capped", doc.id, versions[1].id)).toMatchObject({
      data: { title: "Two" },
    });

    const plain = await cms.create("plain", { title: "0" });
    for (let i = 1; i <= 100; i++) await cms.update("plain", plain.id, { title: String(i) });
    expect(await a.versions("plain", plain.id)).toHaveLength(100);
  });

  it("restore into the draft, or save without drafts", async () => {
    const { a } = await twoEditors();
    const post = await a.create("posts", { title: "One" });
    await a.update("posts", post.id, { title: "Two" });
    const [, first] = await a.versions("posts", post.id);

    expect(await a.restoreVersion("posts", post.id, first.id)).toMatchObject({
      title: "One",
      hasDraft: true,
    });
    expect(await a.findById("posts", post.id)).toMatchObject({ title: "Two" });

    const doc = await a.create("plain", { title: "One" });
    await a.update("plain", doc.id, { title: "Two" });
    const [, old] = await a.versions("plain", doc.id);
    await a.restoreVersion("plain", doc.id, old.id);
    expect(await a.findById("plain", doc.id)).toMatchObject({ title: "One" });
  });

  it("need a session and the right to update", async () => {
    const { cms, b } = await twoEditors();
    const page = await cms.create("pages", { title: "P" });
    const [v] = await cms.withDrafts().find("pages");

    expect(await status(fresh().client.versions("posts", page.id))).toBe(401);
    expect(await status(b.versions("pages", page.id))).toBe(403);
    expect(await status(b.version("pages", page.id, v.id))).toBe(403);
    expect(await status(b.restoreVersion("pages", page.id, "x"))).toBe(403);
    expect(await status(b.version("posts", page.id, "x"))).toBe(404);
  });

  it("hide fields the caller MAY NOT read", async () => {
    const { a, b } = await twoEditors();
    const post = await a.create("posts", { title: "One", notes: "secret" });
    const [v] = await b.versions("posts", post.id);

    const version = await b.version("posts", post.id, v.id);
    expect(version.data).toMatchObject({ title: "One" });
    expect(version.data).not.toHaveProperty("notes");
  });

  it("are kept per locale", async () => {
    const { cms, client } = localized();
    await client.signUp({ name: "Admin", email: "a@b.co", password: "password123" });
    const post = await client.create("posts", { title: "Hello", views: 1 });
    await client.update("posts", post.id, { title: "Hallo" }, { locale: "de" });
    await client.update("posts", post.id, { title: "Hallo!", views: 2 }, { locale: "de" });

    expect(await client.versions("posts", post.id)).toHaveLength(1);
    const de = await client.versions("posts", post.id, { locale: "de" });
    expect(de.map((v) => v.locale)).toEqual(["de", "de"]);

    await client.restoreVersion("posts", post.id, de[1].id);
    const drafts = cms.withDrafts();
    expect(await drafts.findById("posts", post.id, { locale: "de" })).toMatchObject({
      title: "Hallo",
      views: 1,
    });
    expect(await drafts.findById("posts", post.id)).toMatchObject({ title: "Hello" });
  });

  it("work on globals", async () => {
    const { a } = await twoEditors();
    await a.setGlobal("site", { name: "One" });
    await a.setGlobal("site", { name: "Two" });
    const [, first] = await a.globalVersions("site");

    expect(await a.globalVersion("site", first.id)).toMatchObject({ data: { name: "One" } });
    expect(await a.restoreGlobalVersion("site", first.id)).toMatchObject({
      name: "One",
      hasDraft: true,
    });
  });

  it("go with their document", async () => {
    const { a } = await twoEditors();
    const post = await a.create("posts", { title: "One" });
    await a.delete("posts", post.id);

    expect(await a.versions("posts", post.id)).toEqual([]);
  });
});
