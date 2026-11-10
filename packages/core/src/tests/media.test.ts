import { existsSync, readdirSync, readFileSync, rmdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  type Collection,
  defineCms,
  definePlugin,
  type MediaOptions,
  type Plugin,
} from "../index.ts";
import { local } from "../media/storage/local/index.ts";
import { modifierId } from "../media/images/modifiers.ts";
import type { Modifiers } from "../schema/index.ts";
import { png, png300 } from "./fixtures.ts";
import { admin, base, setup, status, tmpDir, withMedia } from "./setup.ts";

const bytes = (n: number) => Uint8Array.from({ length: n }, (_, i) => i % 251);
const text = (s: string) => new TextEncoder().encode(s);
const files = (dir: string) =>
  readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => join(e.parentPath, e.name).slice(dir.length + 1));

describe("media collection", () => {
  it("rejects generic writes", async () => {
    const { cms, client } = withMedia();
    await expect(cms.create("media", { filename: "x.txt" })).rejects.toMatchObject({
      errors: { "": expect.stringContaining("media API") },
    });
    await expect(cms.update("media", "x", {})).rejects.toMatchObject({
      errors: expect.any(Object),
    });
    await expect(cms.delete("media", "x")).rejects.toMatchObject({ errors: expect.any(Object) });
    await client.signUp(admin);
    expect(await status(client.create("media" as never, {} as never))).toBe(400);
  });

  it("reads with find and runs no collection or root hooks", async () => {
    const calls: string[] = [];
    const { cms } = withMedia({}, { hooks: { beforeRead: [() => void calls.push("root")] } });
    expect(await cms.find("media")).toEqual([]);
    expect(calls).toEqual([]);
  });

  it("reserves the name", () => {
    const make =
      (o: { collections?: Record<string, Collection>; media?: MediaOptions; plugins?: Plugin[] }) =>
      () =>
        defineCms({ ...base, ...o });
    const media = { storage: local({ dir: tmpDir() }) };
    const collections = { media: { fields: { t: { type: "text" } } } } as const;
    expect(make({ collections, media })).toThrow(/"media" is reserved/);
    expect(make({ collections })).toThrow(/"media" is reserved/);
    expect(make({ plugins: [definePlugin({ name: "media" })] })).toThrow(/invalid plugin name/);
    const owner = definePlugin({ name: "x", collections });
    expect(make({ plugins: [owner] })).toThrow(/"media" is reserved/);
  });
});

describe("cms.media.upload", () => {
  it("uploads in parts and creates the document", async () => {
    const { cms, dir } = withMedia();
    const data = bytes(3000);
    const doc = await cms.media.upload(data, {
      folder: "/a/b/",
      filename: "data.bin",
      mimeType: "application/octet-stream",
    });
    expect(doc).toMatchObject({
      folder: "a/b",
      filename: "data.bin",
      key: "a/b/data.bin",
      mimeType: "application/octet-stream",
      size: 3000,
      url: "/_tenon/media/files/a/b/data.bin",
    });
    expect(new Uint8Array(readFileSync(join(dir, "a/b/data.bin")))).toEqual(data);
    expect(await cms.findById("media", doc.id)).toMatchObject({ key: "a/b/data.bin" });
  });

  it("uploads a stream with its size", async () => {
    const { cms, dir } = withMedia();
    const data = bytes(2500);
    await cms.media.upload(new Blob([data]).stream(), {
      filename: "s.bin",
      mimeType: "application/octet-stream",
      size: 2500,
    });
    expect(new Uint8Array(readFileSync(join(dir, "s.bin")))).toEqual(data);
  });

  it("reads the dimensions of an image", async () => {
    const { cms } = withMedia();
    const doc = await cms.media.upload(png, { filename: "a.png", mimeType: "image/png" });
    expect(doc).toMatchObject({ width: 1, height: 1, src: doc.url, srcset: "" });
  });

  it("adds a counter to a taken name", async () => {
    const { cms } = withMedia();
    const up = (filename: string) =>
      cms.media.upload(text("x"), { filename, mimeType: "text/plain" });
    expect((await up("hero.txt")).filename).toBe("hero.txt");
    expect((await up("Hero.TXT")).filename).toBe("Hero-1.TXT");
  });

  it("rejects by size, type and folder, keyed by field", async () => {
    const { cms, dir } = withMedia({ maxSize: 10, accept: ["image/*", "text/plain"] });
    const up = (info: object) =>
      cms.media.upload(text("hello"), { filename: "a.txt", mimeType: "text/plain", ...info });
    await expect(
      cms.media.upload(bytes(11), { filename: "a.txt", mimeType: "text/plain" }),
    ).rejects.toMatchObject({
      errors: { size: expect.any(String) },
    });
    await expect(up({ mimeType: "application/pdf" })).rejects.toMatchObject({
      errors: { mimeType: expect.any(String) },
    });
    await expect(up({ folder: "a/../b" })).rejects.toMatchObject({
      errors: { folder: expect.any(String) },
    });
    await expect(up({ folder: ".variants" })).rejects.toMatchObject({
      errors: { folder: expect.any(String) },
    });
    await expect(up({ filename: ".." })).rejects.toMatchObject({
      errors: { filename: expect.any(String) },
    });
    expect(files(dir)).toEqual([]);
  });

  it("rejects a fake image and leaves no file", async () => {
    const { cms, dir } = withMedia();
    await expect(
      cms.media.upload(text("not a png"), { filename: "a.png", mimeType: "image/png" }),
    ).rejects.toMatchObject({ message: "Not a valid image" });
    expect(files(dir)).toEqual([]);
    expect(await cms.find("media")).toEqual([]);
  });

  it("lets beforeUpload rename, and its throw reserves nothing", async () => {
    let fail = false;
    const { cms, dir } = withMedia({
      hooks: {
        beforeUpload: [
          ({ data }) => {
            if (fail) throw new Error("nope");
            return { ...data, folder: "moved", filename: `x-${data.filename}` };
          },
        ],
      },
    });
    expect(
      await cms.media.upload(text("a"), { filename: "a.txt", mimeType: "text/plain" }),
    ).toMatchObject({
      key: "moved/x-a.txt",
    });
    fail = true;
    await expect(
      cms.media.upload(text("a"), { filename: "b.txt", mimeType: "text/plain" }),
    ).rejects.toThrow("nope");
    expect(files(dir)).toEqual(["moved/x-a.txt"]);
  });

  it("gives afterUpload the bytes, and its throw leaves no document and no file", async () => {
    const seen: string[] = [];
    let fail = false;
    const { cms, dir } = withMedia({
      hooks: {
        afterUpload: [
          async ({ doc, read }) => {
            seen.push(`${doc.filename}:${await new Response(await read()).text()}`);
            if (fail) throw new Error("virus");
          },
        ],
      },
    });
    await cms.media.upload(text("clean"), { filename: "a.txt", mimeType: "text/plain" });
    fail = true;
    await expect(
      cms.media.upload(text("bad"), { filename: "b.txt", mimeType: "text/plain" }),
    ).rejects.toThrow("virus");
    expect(seen).toEqual(["a.txt:clean", "b.txt:bad"]);
    expect(files(dir)).toEqual(["a.txt"]);
    expect((await cms.find("media")).map((d) => d.filename)).toEqual(["a.txt"]);
  });

  it("runs the host's media hooks, then each plugin's in order", async () => {
    const calls: string[] = [];
    const hook = (name: string) => ({ afterUpload: [() => void calls.push(name)] });
    const { cms } = withMedia(
      { hooks: hook("host") },
      {
        plugins: [
          definePlugin({ name: "one", mediaHooks: hook("one") }),
          definePlugin({ name: "two", mediaHooks: hook("two") }),
        ],
      },
    );
    await cms.media.upload(text("a"), { filename: "a.txt", mimeType: "text/plain" });
    expect(calls).toEqual(["host", "one", "two"]);
  });
});

describe("upload routes", () => {
  const json = (body: unknown, method = "POST") => ({
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const start = (f: ReturnType<typeof withMedia>["fetchWithSession"], info: object = {}) =>
    f("/media/uploads", json({ filename: "a.bin", mimeType: "text/plain", size: 2500, ...info }));
  const put = (
    f: ReturnType<typeof withMedia>["fetchWithSession"],
    id: string,
    n: number,
    body: BodyInit,
  ) => f(`/media/uploads/${id}/parts/${n}`, { method: "PUT", body });

  it("uploads through the client with progress per part", async () => {
    const { client, dir } = withMedia();
    await client.signUp(admin);
    const data = bytes(3000);
    const progress: number[] = [];
    const doc = await client.media.upload(
      new File([data], "a b.bin", { type: "application/octet-stream" }),
      {
        folder: "up",
        onProgress: ({ loaded, total }) => {
          expect(total).toBe(3000);
          progress.push(loaded);
        },
      },
    );
    expect(doc).toMatchObject({
      key: "up/a b.bin",
      size: 3000,
      url: "/_tenon/media/files/up/a%20b.bin",
    });
    expect(progress).toHaveLength(3);
    expect(progress).toEqual([...progress].sort((a, b) => a - b));
    expect(progress.at(-1)).toBe(3000);
    expect(new Uint8Array(readFileSync(join(dir, "up/a b.bin")))).toEqual(data);
  });

  it("needs a session and the user who started the upload", async () => {
    const m = withMedia();
    expect((await start(m.fetchWithSession)).status).toBe(401);
    await m.client.signUp(admin);
    const { id, parts } = await (await start(m.fetchWithSession)).json();
    expect(parts.map((p: { n: number; url: string }) => p.url)).toEqual(
      [1, 2, 3].map((n) => `/_tenon/media/uploads/${id}/parts/${n}`),
    );
    const auth = await m.cms.auth();
    await auth.api.signUpEmail({ body: { name: "B", email: "b@b.co", password: "password123" } });
    const other = setup(m.cms);
    await other.client.signIn({ email: "b@b.co", password: "password123" });
    const otherFetch = (path: string, init?: RequestInit) =>
      other.fetch(`http://localhost/_tenon${path}`, init);
    expect((await put(otherFetch, id, 1, bytes(1024))).status).toBe(404);
    expect((await put(m.fetchWithSession, id, 1, bytes(1024))).status).toBe(200);
  });

  it("rejects a part out of range, too large or too small", async () => {
    const m = withMedia();
    await m.client.signUp(admin);
    const { id } = await (await start(m.fetchWithSession)).json();
    expect((await put(m.fetchWithSession, id, 4, bytes(10))).status).toBe(400);
    expect((await put(m.fetchWithSession, id, 0, bytes(10))).status).toBe(400);
    expect((await put(m.fetchWithSession, id, 1, bytes(1025))).status).toBe(400);
    expect((await put(m.fetchWithSession, id, 1, bytes(1000))).status).toBe(400);
    expect((await put(m.fetchWithSession, id, 3, bytes(452))).status).toBe(200);
  });

  it("deletes the file when the size does not match", async () => {
    const m = withMedia();
    await m.client.signUp(admin);
    const { id } = await (await start(m.fetchWithSession, { size: 2000 })).json();
    await put(m.fetchWithSession, id, 1, bytes(1024));
    const res = await m.fetchWithSession(`/media/uploads/${id}/complete`, json({ parts: [] }));
    expect(res.status).toBe(400);
    expect(files(m.dir)).toEqual([]);
    expect(
      (await m.fetchWithSession(`/media/uploads/${id}/complete`, json({ parts: [] }))).status,
    ).toBe(404);
  });

  it("reserves the name of an unfinished upload", async () => {
    const m = withMedia();
    await m.client.signUp(admin);
    await start(m.fetchWithSession, { filename: "hero.txt" });
    const doc = await m.client.media.upload(new File(["x"], "hero.txt", { type: "text/plain" }));
    expect(doc.filename).toBe("hero-1.txt");
  });

  it("aborts on a signal and deletes the upload", async () => {
    const m = withMedia();
    await m.client.signUp(admin);
    const controller = new AbortController();
    const upload = m.client.media.upload(new File([bytes(3000)], "a.bin"), {
      signal: controller.signal,
      onProgress: () => controller.abort(),
    });
    await expect(upload).rejects.toThrow();
    expect(files(m.dir)).toEqual([]);
    await expect(m.cms.find("media")).resolves.toEqual([]);
    expect(
      (await m.cms.media.upload(text("x"), { filename: "a.bin", mimeType: "text/plain" })).filename,
    ).toBe("a.bin");
  });

  it("aborts uploads older than a day on the next create", async () => {
    const m = withMedia();
    await m.client.signUp(admin);
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(Date.now() - 25 * 60 * 60 * 1000);
      const { id } = await (await start(m.fetchWithSession, { filename: "old.bin" })).json();
      vi.useRealTimers();
      expect(files(m.dir)).toHaveLength(1);
      await m.cms.media.upload(text("x"), { filename: "new.txt", mimeType: "text/plain" });
      expect(files(m.dir)).toEqual(["new.txt"]);
      expect((await put(m.fetchWithSession, id, 1, bytes(1024))).status).toBe(404);
    } finally {
      vi.useRealTimers();
    }
  });

  it("lists folders with their parents", async () => {
    const m = withMedia();
    await m.cms.media.upload(text("x"), {
      folder: "a/b",
      filename: "x.txt",
      mimeType: "text/plain",
    });
    await m.cms.media.upload(text("x"), { folder: "c", filename: "x.txt", mimeType: "text/plain" });
    await m.cms.media.upload(text("x"), { filename: "x.txt", mimeType: "text/plain" });
    expect(await m.client.media.folders()).toEqual(["a", "a/b", "c"]);
  });

  it("has no media routes with media: false", async () => {
    const { client, fetch } = setup(defineCms({ ...base, media: false }));
    await client.signUp(admin);
    const at = (path: string, init?: RequestInit) => fetch(`http://localhost/_tenon${path}`, init);
    expect((await at("/media/uploads", json({}))).status).toBe(404);
    expect((await at("/media/folders")).status).toBe(404);
  });
});

// A provider that builds readable URLs and records renders.
function spy() {
  const renders: string[] = [];
  return {
    renders,
    provider: {
      getImage: (src: { key: string }, m: Modifiers) => ({
        url: `/img/${modifierId(m)}/${src.key}`,
      }),
      render: async (key: string, m: Modifiers) => {
        renders.push(`${modifierId(m)}/${key}`);
        return { data: text(`rendered ${modifierId(m)}`), mimeType: "image/webp" };
      },
    },
  };
}

describe("image and file fields", () => {
  const images = { provider: spy().provider, sizes: [100, 200] };
  const setupFields = async () => {
    const m = withMedia({ images });
    const image = await m.cms.media.upload(png300, { filename: "hero.png", mimeType: "image/png" });
    const pdf = await m.cms.media.upload(text("%PDF"), {
      filename: "a.pdf",
      mimeType: "application/pdf",
    });
    return { ...m, image, pdf };
  };

  it("checks ids, types and sizes on write", async () => {
    const { cms, image, pdf } = await setupFields();
    const big = await cms.media.upload(bytes(3000), {
      filename: "big.pdf",
      mimeType: "application/pdf",
    });
    const fails = (data: Record<string, unknown>, path: string) =>
      expect(cms.create("posts", data)).rejects.toMatchObject({
        errors: { [path]: expect.any(String) },
      });
    await fails({ hero: "nope" }, "hero");
    await fails({ hero: pdf.id }, "hero");
    await fails({ gallery: [image.id, pdf.id] }, "gallery");
    await fails({ attachment: image.id }, "attachment");
    await fails({ attachment: big.id }, "attachment");
    await expect(
      cms.create("posts", { hero: image.id, gallery: [image.id], attachment: pdf.id }),
    ).resolves.toMatchObject({ hero: image.id });
  });

  it("reads ids with populate: false and images with src and srcset per field", async () => {
    const { cms, image, pdf } = await setupFields();
    const post = await cms.create("posts", { hero: image.id, og: image.id, attachment: pdf.id });
    expect(await cms.findById("posts", post.id, { populate: false })).toMatchObject({
      hero: image.id,
      og: image.id,
    });
    const read = await cms.findById("posts", post.id);
    expect(read?.hero).toMatchObject({
      id: image.id,
      url: "/_tenon/media/files/hero.png",
      width: 300,
      height: 200,
      src: "/img/f_webp&q_85&w_200/hero.png",
      srcset: "/img/f_webp&q_85&w_100/hero.png 100w, /img/f_webp&q_85&w_200/hero.png 200w",
    });
    expect(read?.og).toMatchObject({
      src: "/img/f_webp&q_50&w_150/hero.png",
      srcset: "/img/f_webp&q_50&w_150/hero.png 150w",
    });
    expect(read?.attachment).toMatchObject({ url: "/_tenon/media/files/a.pdf" });
    expect(read?.attachment).not.toHaveProperty("src");
  });

  it("keeps the whole image under select and populate paths", async () => {
    const { cms, client, image } = await setupFields();
    const post = await cms.create("posts", { hero: image.id, title: "x" });
    const read = await cms.findById("posts", post.id, { select: { hero: true } });
    expect(read).toEqual({
      id: post.id,
      hero: expect.objectContaining({ src: expect.any(String) }),
    });
    expect(
      await client.findById("posts", post.id, { populate: { hero: true }, select: { hero: true } }),
    ).toEqual({
      id: post.id,
      hero: expect.objectContaining({ url: "/_tenon/media/files/hero.png" }),
    });
  });

  it("decorates reads of the media collection with the global options", async () => {
    const { cms, client } = await setupFields();
    const [pdf, image] = await cms.find("media");
    expect(image).toMatchObject({
      srcset: expect.stringContaining("100w"),
      url: expect.any(String),
    });
    expect(pdf).toMatchObject({ url: "/_tenon/media/files/a.pdf" });
    expect((await client.find("media"))[1]).toMatchObject({
      srcset: expect.stringContaining("100w"),
    });
  });
});

describe("serving", () => {
  it("streams files with ranges", async () => {
    const m = withMedia();
    await m.cms.media.upload(bytes(3000), {
      folder: "a b",
      filename: "x.bin",
      mimeType: "application/octet-stream",
    });
    const res = await m.fetchWithSession("/media/files/a%20b/x.bin");
    expect(res.status).toBe(200);
    expect(Object.fromEntries(res.headers)).toMatchObject({
      "content-type": "application/octet-stream",
      "content-length": "3000",
      "accept-ranges": "bytes",
      "x-content-type-options": "nosniff",
    });
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(bytes(3000));
    const range = await m.fetchWithSession("/media/files/a%20b/x.bin", {
      headers: { range: "bytes=0-9" },
    });
    expect(range.status).toBe(206);
    expect(range.headers.get("content-range")).toBe("bytes 0-9/3000");
    expect(new Uint8Array(await range.arrayBuffer())).toEqual(bytes(10));
    const tail = await m.fetchWithSession("/media/files/a%20b/x.bin", {
      headers: { range: "bytes=-5" },
    });
    expect(tail.headers.get("content-range")).toBe("bytes 2995-2999/3000");
    const bad = await m.fetchWithSession("/media/files/a%20b/x.bin", {
      headers: { range: "bytes=999999-" },
    });
    expect(bad.status).toBe(416);
    expect(bad.headers.get("content-range")).toBe("bytes */3000");
    expect((await m.fetchWithSession("/media/files/nope.bin")).status).toBe(404);
  });

  it("serves files without a session and sandboxes them", async () => {
    const m = withMedia();
    await m.cms.media.upload(text("<script>alert(1)</script>"), {
      filename: "x.html",
      mimeType: "text/html",
    });
    const res = await m.cms.fetch(new Request("http://localhost/_tenon/media/files/x.html"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-security-policy")).toContain("sandbox");
  });

  // A CDN then absorbs the reads of a private bucket. Keys come back after a delete, so the cache MUST expire.
  it("lets shared caches keep public files and variants for an hour", async () => {
    const { provider } = spy();
    const m = withMedia({ images: { provider, sizes: [100] } });
    await m.cms.media.upload(png300, { filename: "x.png", mimeType: "image/png" });
    for (const path of ["/media/files/x.png", "/media/img/w_100&f_webp&q_85/x.png"]) {
      const res = await m.cms.fetch(new Request(`http://localhost/_tenon${path}`));
      expect(res.headers.get("cache-control")).toBe("public, max-age=300, s-maxage=3600");
    }
  });

  it("keeps files behind a read rule out of shared caches", async () => {
    const m = withMedia({ access: { read: () => true } });
    await m.cms.media.upload(text("x"), { filename: "x.txt", mimeType: "text/plain" });
    const res = await m.cms.fetch(new Request("http://localhost/_tenon/media/files/x.txt"));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-cache");
  });

  it("renders a variant once and serves it from storage after", async () => {
    const { provider, renders } = spy();
    const m = withMedia({ images: { provider, sizes: [100, 200] } });
    await m.cms.media.upload(png300, { folder: "a", filename: "x.png", mimeType: "image/png" });
    const get = () => m.fetchWithSession("/media/img/w_100&q_85&f_webp/a/x.png");
    for (const _ of [1, 2]) {
      const res = await get();
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("image/webp");
      expect(await res.text()).toBe("rendered f_webp&q_85&w_100");
    }
    expect(renders).toEqual(["f_webp&q_85&w_100/a/x.png"]);
    expect(files(m.dir)).toContain(".variants/a/x.png/f_webp&q_85&w_100");
  });

  it("rejects modifiers outside the allowlist, unknown keys and non-images", async () => {
    const { provider } = spy();
    const m = withMedia({ images: { provider, sizes: [100] } });
    await m.cms.media.upload(png300, { filename: "x.png", mimeType: "image/png" });
    await m.cms.media.upload(text("%PDF"), { filename: "x.pdf", mimeType: "application/pdf" });
    expect((await m.fetchWithSession("/media/img/w_999&f_webp&q_85/x.png")).status).toBe(400);
    expect((await m.fetchWithSession("/media/img/bogus/x.png")).status).toBe(400);
    expect((await m.fetchWithSession("/media/img/w_100&f_webp&q_85/nope.png")).status).toBe(404);
    expect((await m.fetchWithSession("/media/img/w_100&f_webp&q_85/x.pdf")).status).toBe(404);
  });

  it("serves no /img route without render", async () => {
    const m = withMedia({ images: { provider: { getImage: () => ({ url: "" }) } } });
    await m.client.signUp(admin);
    expect((await m.fetchWithSession("/media/img/w_320&f_webp&q_85/x.png")).status).toBe(404);
  });

  it("prerenders every allowed variant and logs failures", async () => {
    const { provider, renders } = spy();
    const failing = {
      ...provider,
      prerender: true,
      render: async (key: string, mods: Modifiers) => {
        if (mods.width === 200) throw new Error("boom");
        return provider.render(key, mods);
      },
    };
    const m = withMedia({ images: { provider: failing, sizes: [100, 200] } });
    const error = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const doc = await m.cms.media.upload(png300, { filename: "x.png", mimeType: "image/png" });
    expect(error).toHaveBeenCalledWith(expect.stringContaining("Rendering"));
    error.mockRestore();
    expect(doc.filename).toBe("x.png");
    expect(renders).toContain("f_webp&q_85&w_100/x.png");
    expect(renders).toContain("f_webp&q_50&w_150/x.png");
    expect(files(m.dir)).toContain(".variants/x.png/f_webp&q_85&w_100");
    expect(files(m.dir)).not.toContain(".variants/x.png/f_webp&q_85&w_200");
  });

  it("gives images above images.maxSize no variants", async () => {
    const { provider } = spy();
    const m = withMedia({ images: { provider, sizes: [100], maxSize: 100 } });
    const doc = await m.cms.media.upload(png300, { filename: "x.png", mimeType: "image/png" });
    expect(doc).toMatchObject({ src: doc.url, srcset: "" });
    expect((await m.fetchWithSession("/media/img/w_100&f_webp&q_85/x.png")).status).toBe(404);
  });
});

describe("moves and deletes", () => {
  // `local()` whose `move` or `delete` fail on demand.
  function flaky() {
    const dir = tmpDir();
    const store = local({ dir, partSize: 1024 });
    const fail = { move: false, delete: false };
    const storage = {
      ...store,
      move: async (from: string, to: string) => {
        if (fail.move) throw new Error("disk full");
        return store.move(from, to);
      },
      delete: async (key: string) => {
        if (fail.delete) throw new Error("disk gone");
        return store.delete(key);
      },
    };
    return { dir, fail, storage };
  }
  const upload = (cms: ReturnType<typeof withMedia>["cms"], filename: string, folder = "") =>
    cms.media.upload(filename.endsWith(".png") ? png300 : text(filename), {
      folder,
      filename,
      mimeType: filename.endsWith(".png") ? "image/png" : "text/plain",
    });

  it("changes alt with change hooks and no move", async () => {
    const calls: string[] = [];
    const m = withMedia({
      hooks: {
        beforeChange: [({ data }) => (calls.push("beforeChange"), { alt: `${data.alt}!` })],
        afterChange: [
          ({ doc, previousDoc }) => void calls.push(`afterChange:${previousDoc.alt}>${doc.alt}`),
        ],
        beforeMove: [() => void calls.push("beforeMove")],
      },
    });
    const doc = await upload(m.cms, "a.txt");
    expect(await m.cms.media.update(doc.id, { alt: "Hi" })).toMatchObject({
      alt: "Hi!",
      key: "a.txt",
    });
    expect(calls).toEqual(["beforeChange", "afterChange:undefined>Hi!"]);
    expect(files(m.dir)).toEqual(["a.txt"]);
    expect(await m.cms.media.update("nope", { alt: "x" })).toBeUndefined();
  });

  it("moves the file and its variants on rename", async () => {
    const calls: string[] = [];
    const { provider } = spy();
    const m = withMedia({
      images: { provider, sizes: [100] },
      hooks: {
        beforeMove: [({ from, to }) => void calls.push(`before:${from}>${to}`)],
        afterMove: [({ from, to, doc }) => void calls.push(`after:${from}>${to}:${doc.key}`)],
      },
    });
    const doc = await upload(m.cms, "a.png", "x");
    await m.fetchWithSession("/media/img/f_webp&q_85&w_100/x/a.png");
    const moved = await m.cms.media.update(doc.id, { folder: "y/z", filename: "b.png" });
    expect(moved).toMatchObject({ key: "y/z/b.png", url: "/_tenon/media/files/y/z/b.png" });
    expect(files(m.dir).sort()).toEqual([".variants/y/z/b.png/f_webp&q_85&w_100", "y/z/b.png"]);
    expect(calls).toEqual(["before:x/a.png>y/z/b.png", "after:x/a.png>y/z/b.png:y/z/b.png"]);
  });

  it("rejects a taken name, and beforeMove can block", async () => {
    let block = false;
    const m = withMedia({
      hooks: {
        beforeMove: [
          () => {
            if (block) throw new Error("locked");
          },
        ],
      },
    });
    await upload(m.cms, "hero.txt");
    const other = await upload(m.cms, "b.txt");
    await expect(m.cms.media.update(other.id, { filename: "Hero.TXT" })).rejects.toMatchObject({
      errors: { filename: "Already used" },
    });
    expect((await m.cms.media.update(other.id, { filename: "B.txt" }))?.key).toBe("B.txt");
    block = true;
    await expect(m.cms.media.update(other.id, { filename: "c.txt" })).rejects.toThrow("locked");
    expect(files(m.dir).sort()).toEqual(["B.txt", "hero.txt"]);
  });

  it("changes nothing when storage fails, and moves back when the update fails", async () => {
    const { dir, fail, storage } = flaky();
    let failAfter = false;
    const m = withMedia({
      storage,
      hooks: {
        afterMove: [
          () => {
            if (failAfter) throw new Error("db");
          },
        ],
      },
    });
    const doc = await upload(m.cms, "a.txt");
    fail.move = true;
    await expect(m.cms.media.update(doc.id, { filename: "b.txt" })).rejects.toThrow("disk full");
    fail.move = false;
    failAfter = true;
    await expect(m.cms.media.update(doc.id, { filename: "b.txt" })).rejects.toThrow("db");
    expect(files(dir)).toEqual(["a.txt"]);
    expect((await m.cms.findById("media", doc.id))?.key).toBe("a.txt");
  });

  it("renames folders, reports failures, and finishes on a second call", async () => {
    const m = withMedia();
    await upload(m.cms, "x.txt", "a");
    await upload(m.cms, "y.txt", "a/c");
    const blocker = await upload(m.cms, "x.txt", "b");
    await m.client.signUp(admin);
    expect(await status(m.client.media.renameFolder("a", "a/c/d"))).toBe(400);
    const first = await m.client.media.renameFolder("/a/", "b");
    expect(first).toMatchObject({ moved: 1, failed: [{ message: "Already used" }] });
    expect(files(m.dir).sort()).toEqual(["a/x.txt", "b/c/y.txt", "b/x.txt"]);
    await m.cms.media.update(blocker.id, { filename: "z.txt" });
    expect(await m.cms.media.renameFolder("a", "b")).toEqual({ moved: 1, failed: [] });
    expect(files(m.dir).sort()).toEqual(["b/c/y.txt", "b/x.txt", "b/z.txt"]);
    expect(await m.client.media.folders()).toEqual(["b", "b/c"]);
  });

  it("deletes the document, then the file and its variants, then runs afterDelete", async () => {
    const { provider } = spy();
    let block = true;
    const seen: boolean[] = [];
    const m = withMedia({
      images: { provider, sizes: [100] },
      hooks: {
        beforeDelete: [
          () => {
            if (block) throw new Error("keep");
          },
        ],
        afterDelete: [({ doc }) => void seen.push(existsSync(join(m.dir, doc.key)))],
      },
    });
    const doc = await upload(m.cms, "a.png");
    await m.fetchWithSession("/media/img/f_webp&q_85&w_100/a.png");
    await expect(m.cms.media.delete(doc.id)).rejects.toThrow("keep");
    block = false;
    await m.client.signUp(admin);
    expect(await m.client.media.delete(doc.id)).toBeNull();
    expect(files(m.dir)).toEqual([]);
    expect(seen).toEqual([false]);
    expect(await m.cms.find("media")).toEqual([]);
  });

  it("logs a failed storage delete and still deletes", async () => {
    const { dir, fail, storage } = flaky();
    const m = withMedia({ storage });
    const doc = await upload(m.cms, "a.txt");
    fail.delete = true;
    const error = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    await m.cms.media.delete(doc.id);
    expect(error).toHaveBeenCalledWith(expect.stringContaining("Deleting"));
    error.mockRestore();
    expect(await m.cms.find("media")).toEqual([]);
    expect(files(dir)).toEqual(["a.txt"]);
  });

  it("applies onDelete: restrict by default, set-null where set", async () => {
    const m = withMedia();
    const image = await upload(m.cms, "a.png");
    const post = await m.cms.create("posts", { hero: image.id, og: image.id, gallery: [image.id] });
    await m.client.signUp(admin);
    const error = await m.client.media.delete(image.id).catch((e) => e);
    expect(error.status).toBe(409);
    expect(error.body.references).toEqual([{ collection: "posts", id: post.id }]);
    await m.cms.update("posts", post.id, { hero: null });
    await m.cms.media.delete(image.id);
    expect(await m.cms.findById("posts", post.id, { populate: false })).toMatchObject({
      og: null,
      gallery: [],
    });
    expect(files(m.dir)).toEqual([]);
  });

  it("changes alt over HTTP and 404s an unknown id", async () => {
    const m = withMedia();
    const doc = await upload(m.cms, "a.txt");
    await m.client.signUp(admin);
    expect(await m.client.media.update(doc.id, { alt: "x" })).toMatchObject({ alt: "x" });
    expect(await status(m.client.media.update("nope", { alt: "x" }))).toBe(404);
  });
});

describe("default media", () => {
  it("uses local storage in ./.uploads and prerendered WebP at quality 85", async () => {
    const { defaultMedia } = await import("../media/default.ts");
    const { createMediaCore } = await import("../media/runtime/create-media-core.ts");
    const media = createMediaCore(defaultMedia(false)!, {
      collections: {},
      globals: {},
      blocks: {},
    });
    expect(media.storage.url("a.png")).toBe("/_tenon/media/files/a.png");
    const key = `test-${crypto.randomUUID()}.txt`;
    await media.storage.put(key, text("x"), "text/plain");
    expect(existsSync(join(process.cwd(), ".uploads", key))).toBe(true);
    await media.storage.delete(key);
    rmdirSync(join(process.cwd(), ".uploads"));
    expect(media.images).toMatchObject({
      format: "webp",
      quality: 85,
      provider: { prerender: true },
    });
  });

  it("is on without a media option and with media: true, off with media: false", () => {
    expect(defineCms({ ...base }).schema.collections).toHaveProperty("media");
    expect(defineCms({ ...base, media: true }).schema.collections).toHaveProperty("media");
    expect(defineCms({ ...base, media: false }).schema.collections).not.toHaveProperty("media");
  });

  it("throws for local, ipx and media: true on Cloudflare Workers", async () => {
    const workerd = await import("../media/workerd.ts");
    expect(() => workerd.local({ dir: "x" })).toThrow(/does not run on Cloudflare Workers/);
    expect(() => workerd.ipx()).toThrow(/does not run on Cloudflare Workers/);
    expect(() => workerd.defaultMedia(true)).toThrow(/`media: true`/);
    expect(workerd.defaultMedia(false)).toBeUndefined();
  });
});

describe("regenerate", () => {
  // A stale variant from an older config, and one allowed variant that is missing.
  const setupStale = async (prerender: boolean) => {
    const { provider, renders } = spy();
    const m = withMedia({ images: { provider: { ...provider, prerender }, sizes: [100, 200] } });
    const doc = await m.cms.media.upload(png300, {
      folder: "a",
      filename: "x.png",
      mimeType: "image/png",
    });
    const storage = local({ dir: m.dir });
    await storage.put(".variants/a/x.png/f_webp&q_10&w_999", text("old"), "image/webp");
    await storage.delete(".variants/a/x.png/f_webp&q_85&w_200");
    renders.length = 0;
    return { ...m, doc, renders, storage };
  };
  const variants = (dir: string) =>
    files(dir)
      .filter((f) => f.startsWith(".variants/"))
      .sort();
  const json = (body: object): RequestInit => ({
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost" },
    body: JSON.stringify(body),
  });

  it("removes stale variants and renders missing ones with prerender", async () => {
    const m = await setupStale(true);
    expect(await m.cms.media.regenerate(m.doc.id)).toEqual({ rendered: 1, removed: 1 });
    expect(m.renders).toEqual(["f_webp&q_85&w_200/a/x.png"]);
    expect(variants(m.dir)).not.toContain(".variants/a/x.png/f_webp&q_10&w_999");
    expect(variants(m.dir)).toContain(".variants/a/x.png/f_webp&q_85&w_200");
  });

  it("re-renders every variant with force", async () => {
    const m = await setupStale(true);
    const before = variants(m.dir).length;
    const result = await m.cms.media.regenerate(m.doc.id, { force: true });
    expect(result?.removed).toBe(1);
    expect(result?.rendered).toBe(m.renders.length);
    expect(m.renders).toContain("f_webp&q_85&w_100/a/x.png");
    expect(variants(m.dir)).toHaveLength(before);
  });

  it("only cleans up without prerender; force deletes every variant", async () => {
    const m = await setupStale(false);
    await m.fetchWithSession("/media/img/f_webp&q_85&w_100/a/x.png");
    expect(await m.cms.media.regenerate(m.doc.id)).toEqual({ rendered: 0, removed: 1 });
    expect(variants(m.dir)).toEqual([".variants/a/x.png/f_webp&q_85&w_100"]);
    expect(await m.cms.media.regenerate(m.doc.id, { force: true })).toEqual({
      rendered: 0,
      removed: 1,
    });
    expect(variants(m.dir)).toEqual([]);
  });

  it("regenerates every image and removes variants of missing files", async () => {
    const m = await setupStale(true);
    await m.storage.put(".variants/gone.png/f_webp&q_85&w_100", text("old"), "image/webp");
    expect(await m.cms.media.regenerate()).toEqual({ rendered: 1, removed: 2 });
    expect(variants(m.dir).some((f) => f.includes("gone.png"))).toBe(false);
  });

  it("moves and deletes every listed variant, stale ones too", async () => {
    const m = await setupStale(true);
    await m.cms.media.update(m.doc.id, { folder: "b" });
    expect(variants(m.dir)).toContain(".variants/b/x.png/f_webp&q_10&w_999");
    await m.cms.media.delete(m.doc.id);
    expect(files(m.dir)).toEqual([]);
  });

  it("has a route per file and tells /schema, 404 without render", async () => {
    const m = await setupStale(true);
    await m.client.signUp(admin);
    expect((await m.client.getSchema()).media).toEqual({ regenerate: true });
    const res = await m.fetchWithSession(`/media/${m.doc.id}/regenerate`, json({ force: false }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ rendered: 1, removed: 1 });
    expect(await m.client.media.regenerate(m.doc.id, { force: true })).toMatchObject({
      removed: 0,
    });
    expect((await m.fetchWithSession("/media/nope/regenerate", json({}))).status).toBe(404);
    const plain = withMedia({ images: { provider: { getImage: () => ({ url: "" }) } } });
    await plain.client.signUp(admin);
    expect((await plain.client.getSchema()).media).toEqual({ regenerate: false });
    const doc = await plain.cms.media.upload(png300, { filename: "x.png", mimeType: "image/png" });
    expect((await plain.fetchWithSession(`/media/${doc.id}/regenerate`, json({}))).status).toBe(
      404,
    );
  });
});
