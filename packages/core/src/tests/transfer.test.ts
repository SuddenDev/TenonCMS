import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { makeZip } from "client-zip";
import { describe, expect, it, vi } from "vitest";
import { defineCms } from "../index.ts";
import { local } from "../media/storage/local/index.ts";
import { readZip } from "../transfer/read-zip.ts";
import { png } from "./fixtures.ts";
import {
  base,
  localized,
  origin,
  post,
  relational,
  seed,
  testDatabase,
  tmpDir,
  withAdmin,
  withMedia,
} from "./setup.ts";

const archiveOf = async (cms: { export(o?: { media?: boolean }): Promise<ReadableStream> }) =>
  new Response(await cms.export()).blob();

describe("export and import", () => {
  it("keeps ids, times, drafts and relations", async () => {
    const a = relational();
    const { p } = await seed(a);
    await a.update("posts", p.id, { title: "Pending" }, { draft: true });
    await a.setGlobal("site", { featured: [p.id] });

    const b = relational();
    const counts = await b.import(await archiveOf(a));

    expect(counts).toMatchObject({ cms_documents: 5, cms_globals: 1 });
    expect(counts.cms_versions).toBeGreaterThan(0);
    expect(await b.find("posts", { depth: 1 })).toEqual(await a.find("posts", { depth: 1 }));
    expect(await b.withDrafts().find("posts")).toEqual(await a.withDrafts().find("posts"));
    expect(await b.getGlobal("site")).toEqual(await a.getGlobal("site"));
  });

  it("keeps locale rows", async () => {
    const a = localized().cms;
    const author = await a.create("authors", { name: "Ann" });
    const post = await a.create("posts", { title: "Hello", author: author.id });
    await a.update("posts", post.id, { title: "Hallo" }, { locale: "de" });
    await a.setGlobal("site", { tagline: "Moin" }, { locale: "de" });

    const b = localized().cms;
    await b.import(await archiveOf(a));

    for (const locale of ["en", "de"] as const) {
      expect(await b.findById("posts", post.id, { locale })).toEqual(
        await a.findById("posts", post.id, { locale }),
      );
      expect(await b.getGlobal("site", { locale })).toEqual(await a.getGlobal("site", { locale }));
    }
  });

  it("merge overwrites, missing keeps and replace removes", async () => {
    const a = relational();
    const tag = await a.create("tags", { name: "from archive" });
    const archive = await archiveOf(a);

    const b = relational();
    await b.import(archive);
    await b.update("tags", tag.id, { name: "edited" });
    const other = await b.create("tags", { name: "only here" });

    await b.import(archive, { mode: "missing" });
    expect((await b.findById("tags", tag.id))?.name).toBe("edited");

    await b.import(archive, { mode: "merge" });
    expect((await b.findById("tags", tag.id))?.name).toBe("from archive");
    expect(await b.findById("tags", other.id)).toBeDefined();

    await b.import(archive, { mode: "replace" });
    expect((await b.find("tags")).map((t) => t.id)).toEqual([tag.id]);
  });

  it("rejects an archive with a collection the schema does not have", async () => {
    const a = relational();
    await seed(a);
    const b = defineCms({ ...base, database: testDatabase() });

    await expect(b.import(await archiveOf(a))).rejects.toMatchObject({
      errors: { archive: expect.stringContaining("collection:assets") },
    });
  });

  it("reads an archive of an older schema without its removed fields", async () => {
    const block = { fields: { text: { type: "text" }, gone: { type: "text" } } } as const;
    const a = defineCms({
      ...base,
      database: testDatabase(),
      collections: {
        posts: {
          fields: {
            ...base.collections.posts.fields,
            gone: { type: "text" },
            seo: { type: "group", fields: { title: { type: "text" }, gone: { type: "text" } } },
            links: { type: "array", fields: { label: { type: "text" }, gone: { type: "text" } } },
            content: { type: "blocks", blocks: { note: block } },
          },
        },
      },
      globals: { site: { fields: { name: { type: "text" }, gone: { type: "text" } } } },
    });
    const post = await a.create("posts", {
      title: "Hi",
      gone: "x",
      seo: { title: "S", gone: "x" },
      links: [{ label: "L", gone: "x" }],
      content: [{ blockType: "note", text: "T", gone: "x" }],
    });
    await a.setGlobal("site", { name: "N", gone: "x" });

    const b = defineCms({
      ...base,
      database: testDatabase(),
      collections: {
        posts: {
          fields: {
            ...base.collections.posts.fields,
            links: { type: "array", fields: { label: { type: "text" } } },
            content: { type: "blocks", blocks: { note: { fields: { text: { type: "text" } } } } },
          },
        },
      },
    });
    await b.import(await archiveOf(a));

    const read = await b.findById("posts", post.id);
    expect(read).not.toHaveProperty("gone");
    expect(read?.seo).toEqual({ title: "S" });
    expect(read?.links).toEqual([{ id: expect.any(String), label: "L" }]);
    expect(read?.content).toEqual([{ id: expect.any(String), blockType: "note", text: "T" }]);
    expect(await b.getGlobal("site")).not.toHaveProperty("gone");
  });

  it("rejects data that is not an archive", async () => {
    const b = relational();
    const zip = await new Response(makeZip([{ name: "a.txt", input: "a" }])).blob();

    await expect(b.import(new Blob(["nope"]))).rejects.toMatchObject({
      errors: { archive: expect.stringContaining("ZIP") },
    });
    await expect(b.import(zip)).rejects.toMatchObject({
      errors: { archive: "Not a tenon archive" },
    });
  });

  it("moves values to the config's localized fields on replace only", async () => {
    const a = localized().cms;
    const post = await a.create("posts", { title: "Hello", body: "Text" });
    const archive = await archiveOf(a);
    // `body` is shared on this config.
    const b = localized({ collections: { posts: { fields: { ...bodyShared } } } }).cms;

    await expect(b.import(archive)).rejects.toMatchObject({
      errors: { archive: expect.stringContaining("replace") },
    });
    await b.import(archive, { mode: "replace" });
    expect(await b.findById("posts", post.id)).toMatchObject({ body: "Text" });
  });

  it("clears authors that do not exist in the target", async () => {
    const a = await withAdmin(relational());
    await a.client.create("tags", { name: "by admin" });
    const b = relational();

    await b.import(await archiveOf(a.cms));

    expect(await b.find("tags")).toMatchObject([{ createdBy: null, updatedBy: null }]);
  });

  it("restores media files", async () => {
    const a = withMedia();
    const file = await a.cms.media!.upload(png, { filename: "hero.png", mimeType: "image/png" });
    const b = withMedia();

    const counts = await b.cms.import(await archiveOf(a.cms));

    expect(counts.media).toBe(1);
    expect(await b.cms.findById("media", file.id)).toEqual(await a.cms.findById("media", file.id));
    expect(new Uint8Array(readFileSync(join(b.dir, file.key)))).toEqual(png);
  });

  it("skips media files that are already in storage", async () => {
    const a = withMedia();
    await a.cms.media!.upload(png, { filename: "hero.png", mimeType: "image/png" });
    const archive = await archiveOf(a.cms);
    const storage = local({ dir: tmpDir(), partSize: 1024 });
    const b = withMedia({ storage });
    await b.cms.import(archive);
    const put = vi.spyOn(storage, "put");
    const multipart = vi.spyOn(storage, "createUpload");

    expect(await b.cms.import(archive)).toMatchObject({ media: 1 });
    expect(put).not.toHaveBeenCalled();
    expect(multipart).not.toHaveBeenCalled();
  });

  it("leaves media files out with media: false", async () => {
    const a = withMedia();
    await a.cms.media!.upload(png, { filename: "hero.png", mimeType: "image/png" });
    const b = withMedia();

    const counts = await b.cms.import(
      await new Response(await a.cms.export({ media: false })).blob(),
    );

    expect(counts).toMatchObject({ cms_documents: 1, media: 0 });
  });
});

describe("export and import over HTTP", () => {
  it("lets admins download and restore an archive", async () => {
    const a = await withAdmin(relational());
    await seed(a.cms);

    const res = await a.fetch(`${origin}/_tenon/export`);
    expect(res.headers.get("content-type")).toBe("application/zip");
    expect(res.headers.get("content-disposition")).toMatch(/^attachment/);
    expect(res.headers.get("cache-control")).toContain("no-store");
    const archive = await res.blob();

    const b = await withAdmin(relational());
    const restored = await b.fetch(`${origin}/_tenon/import?mode=replace`, {
      method: "POST",
      headers: { "content-type": "application/zip" },
      body: archive,
    });
    expect(await restored.json()).toMatchObject({ cms_documents: 5 });
    expect(await b.cms.find("posts")).toEqual(await a.cms.find("posts"));
    expect((await a.client.export({ media: false })).size).toBeGreaterThan(0);
  });

  it("sends the archive in the body without media storage", async () => {
    const config = { ...base, media: false } as const;
    const a = defineCms({ ...config, database: testDatabase() });
    await a.create("posts", { title: "Hello" });
    const b = await withAdmin(defineCms({ ...config, database: testDatabase() }));

    expect(await b.client.import(await archiveOf(a))).toMatchObject({ cms_documents: 1 });
  });

  it("needs a zip body and a valid mode", async () => {
    const { fetch } = await withAdmin(relational());
    const post = (query: string, type: string) =>
      fetch(`${origin}/_tenon/import${query}`, {
        method: "POST",
        headers: { "content-type": type },
        body: "x",
      });

    expect((await post("", "application/json")).status).toBe(415);
    expect((await post("?mode=wipe", "application/zip")).status).toBe(400);
  });

  it("is for admins only", async () => {
    const env = await withAdmin(relational());
    await env.create({ email: "e@b.co", password: "password123", name: "E", role: "editor" });
    await env.client.signOut();
    await env.client.signIn({ email: "e@b.co", password: "password123" });

    expect((await env.fetch(`${origin}/_tenon/export`)).status).toBe(403);
    const visitor = await env.cms.withSession(new Request(origin));
    await expect(visitor.export()).rejects.toMatchObject({ status: 401 });
  });
});

describe("full backup", () => {
  const fullArchive = async (cms: { export(o: { scope: "full" }): Promise<ReadableStream> }) =>
    new Response(await cms.export({ scope: "full" })).blob();
  const manifestOf = async (archive: Blob) =>
    JSON.parse(await new Response((await readZip(archive)).get("manifest.json")!.stream()).text());
  const editor = { email: "e@b.co", password: "password123", name: "E", role: "editor" };

  it("restores users, accounts and API keys, and clears sessions", async () => {
    const a = await withAdmin(relational());
    await seed(a.cms);
    await a.create(editor);
    const { key } = await a.client.apiKeys.create({
      name: "CI",
      permissions: { backup: ["read"] },
    });
    const archive = await fullArchive(a.cms);

    const b = await withAdmin(relational());
    await b.cms.import(archive, { mode: "replace" });

    expect(await b.cms.find("posts")).toEqual(await a.cms.find("posts"));
    expect(await b.client.getSession()).toBeNull();
    await b.client.signIn({ email: editor.email, password: editor.password });
    const res = await b.cms.fetch(
      new Request(`${origin}/_tenon/export/summary`, { headers: { "x-api-key": key } }),
    );
    expect(res.status).toBe(200);
  });

  it("needs mode replace", async () => {
    const a = await withAdmin(relational());
    const b = await withAdmin(relational());

    await expect(b.cms.import(await fullArchive(a.cms))).rejects.toMatchObject({
      errors: { archive: expect.stringContaining("replace") },
    });
  });

  it("checks an archive without writing it", async () => {
    const a = await withAdmin(relational());
    await seed(a.cms);
    const b = await withAdmin(relational());
    const tag = await b.cms.create("tags", { name: "stays" });

    const check = await b.cms.import(await fullArchive(a.cms), { mode: "replace", dryRun: true });

    expect(check.errors).toEqual([]);
    expect(check.writes?.tables.cms_documents).toBe(5);
    expect(check.deletes.tables.cms_documents).toBe(1);
    expect(await b.cms.findById("tags", tag.id)).toBeDefined();
  });

  it("refuses another database dialect or other migrations", async () => {
    const a = await withAdmin(relational());
    const manifest = await manifestOf(await fullArchive(a.cms));
    const b = await withAdmin(relational());

    const check = (m: object) => b.client.checkImport(m as never, { mode: "replace" });

    expect((await check(manifest)).errors).toEqual([]);
    expect((await check({ ...manifest, dialect: "other" })).errors).toEqual([
      expect.stringContaining("other"),
    ]);
    expect(
      (await check({ ...manifest, migrations: [...manifest.migrations, "999_x"] })).errors,
    ).toEqual([expect.stringContaining("999_x")]);
  });

  it("summarizes what an export holds", async () => {
    const a = await withAdmin(relational());
    await seed(a.cms);

    const summary = await a.cms.exportSummary({ scope: "full" });

    expect(summary.tables).toMatchObject({ cms_documents: 5, user: 1, account: 1 });
    expect(summary.tables).not.toHaveProperty("session");
    expect((await a.cms.exportSummary()).tables).not.toHaveProperty("user");
  });

  it("lets an API key with the backup permission export, and import only with update", async () => {
    const a = await withAdmin(relational());
    const keyWith = async (backup: ("read" | "update")[]) =>
      (await a.client.apiKeys.create({ name: backup.join() || "none", permissions: { backup } }))
        .key;
    const call = async (key: string, path: string, init: RequestInit = {}) =>
      (
        await a.cms.fetch(
          new Request(`${origin}/_tenon${path}`, {
            ...init,
            headers: { "x-api-key": key, "content-type": "application/zip" },
          }),
        )
      ).status;
    const reader = await keyWith(["read"]);
    const none = await a.client.apiKeys.create({
      name: "posts",
      permissions: { "collection:posts": ["read"] },
    });

    expect(await call(reader, "/export")).toBe(200);
    expect(await call(reader, "/import?mode=replace", { method: "POST", body: "x" })).toBe(403);
    expect(
      await call(await keyWith(["update"]), "/import?mode=replace", { method: "POST", body: "x" }),
    ).toBe(400);
    expect(await call(none.key, "/export")).toBe(403);
  });
});

describe("staged export and import", () => {
  const zips = (dir: string) =>
    readdirSync(dir, { recursive: true }).filter((f) => String(f).endsWith(".zip"));

  it("uploads the archive into storage in parts, imports it and deletes it", async () => {
    const a = withMedia();
    const file = await a.cms.media!.upload(png, { filename: "hero.png", mimeType: "image/png" });
    const archive = await archiveOf(a.cms);
    const target = withMedia();
    const b = await withAdmin(target.cms);
    const loaded: number[] = [];

    const counts = await b.client.import(archive, {
      mode: "replace",
      onProgress: (p) => loaded.push(p.loaded),
    });

    expect(counts).toMatchObject({ cms_documents: 1, media: 1 });
    expect(loaded.length).toBeGreaterThan(1);
    expect(loaded.at(-1)).toBe(archive.size);
    expect(await b.cms.find("media")).toEqual(await a.cms.find("media"));
    expect(new Uint8Array(readFileSync(join(target.dir, file.key)))).toEqual(png);
    expect(zips(target.dir)).toEqual([]);
  });

  it("deletes the staged archive when the import fails", async () => {
    const target = withMedia();
    const b = await withAdmin(target.cms);

    await expect(b.client.import(new Blob(["nope"]))).rejects.toMatchObject({ status: 400 });
    expect(
      readdirSync(target.dir, { recursive: true }).filter((f) => !String(f).startsWith(".tmp")),
    ).toEqual([]);
  });

  it("keeps import uploads out of the media routes", async () => {
    const b = await withAdmin(withMedia().cms);
    const plan = await (await post(b.fetch, "/import/uploads", { size: 10 })).json();
    expect(plan.id).toBeTruthy();

    expect((await post(b.fetch, `/media/uploads/${plan.id}/complete`, { parts: [] })).status).toBe(
      404,
    );
  });

  it("is for admins only", async () => {
    const env = await withAdmin(withMedia().cms);
    await env.create({ email: "e@b.co", password: "password123", name: "E", role: "editor" });
    await env.client.signOut();
    await env.client.signIn({ email: "e@b.co", password: "password123" });

    expect((await post(env.fetch, "/import/uploads", { size: 10 })).status).toBe(403);
    expect((await post(env.fetch, "/export", {})).status).toBe(403);
  });

  it("links to the streamed export without direct downloads", async () => {
    const b = await withAdmin(withMedia().cms);

    expect(await b.client.exportLink({ media: false })).toBe(`${origin}/_tenon/export?media=false`);
  });

  it("writes the export into storage when it has direct downloads", async () => {
    const storage = local({ dir: tmpDir(), partSize: 1024 });
    storage.downloadUrl = async (key, filename) =>
      `https://bucket.test/${key}?filename=${filename}`;
    const target = withMedia({ storage });
    const b = await withAdmin(target.cms);
    await b.cms.media!.upload(png, { filename: "hero.png", mimeType: "image/png" });
    await storage.put(".tenon/exports/1000-old.zip", new Uint8Array([1]), "application/zip");

    const url = new URL(await b.client.exportLink());

    expect(url.searchParams.get("filename")).toMatch(/^tenon-.*\.zip$/);
    const staged = await storage.get(decodeURIComponent(url.pathname.slice(1)));
    const entries = await readZip(await new Response(staged!.body).blob());
    expect([...entries.keys()]).toContain("manifest.json");
    expect([...entries.keys()].some((k) => k.startsWith("media/"))).toBe(true);
    expect(await storage.get(".tenon/exports/1000-old.zip")).toBeUndefined();
  });
});

const bodyShared = { body: { type: "text", localized: false } } as const;
