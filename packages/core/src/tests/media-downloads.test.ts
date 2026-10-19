import { describe, expect, it, vi } from "vitest";
import { local } from "../media/storage/local/index.ts";
import { admin, tmpDir, withMedia } from "./setup.ts";

const text = (value: string) => new TextEncoder().encode(value);
const url = (ids: string[] = [], folders: string[] = []) =>
  `/media/download?${new URLSearchParams([...ids.map((id) => ["id", id]), ...folders.map((folder) => ["folder", folder])])}`;

describe("media downloads", () => {
  it("requires a session and rejects empty or unsafe selections", async () => {
    const m = withMedia();
    expect((await m.fetchWithSession(url(["missing"]))).status).toBe(401);
    await m.client.signUp(admin);
    expect((await m.fetchWithSession(url())).status).toBe(400);
    expect((await m.fetchWithSession(url([], ["a/../b"]))).status).toBe(400);
    expect((await m.fetchWithSession(url(["missing"]))).status).toBe(404);
  });

  it("downloads one original as an attachment with a Unicode filename", async () => {
    const m = withMedia();
    const doc = await m.cms.media.upload(text("hello"), {
      filename: "café.txt",
      mimeType: "text/plain",
    });
    await m.client.signUp(admin);
    const response = await m.fetchWithSession(url([doc.id]));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toContain("caf%C3%A9.txt");
    expect(response.headers.get("content-type")).toBe("text/plain");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-security-policy")).toContain("sandbox");
    expect(await response.text()).toBe("hello");
    const part = await m.fetchWithSession(url([doc.id]), { headers: { range: "bytes=1-3" } });
    expect(part.status).toBe(206);
    expect(part.headers.get("content-disposition")).toContain("caf%C3%A9.txt");
    expect(await part.text()).toBe("ell");
  });

  it("includes an empty directory in a folder download", async () => {
    const m = withMedia();
    await m.client.signUp(admin);
    const response = await m.fetchWithSession(url([], ["posts/empty"]));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toContain("empty.zip");
    expect(await response.text()).toContain("empty/");
  });

  it("streams a folder ZIP with nested paths and excludes sibling folders and variants", async () => {
    const m = withMedia();
    const up = (filename: string, folder: string, value: string) =>
      m.cms.media.upload(text(value), { filename, folder, mimeType: "text/plain" });
    const a = await up("a.txt", "posts/images", "first payload");
    await up("b.txt", "posts/images/trips", "second payload");
    await up("secret.txt", "posts/images-old", "not included");
    await m.client.signUp(admin);
    const response = await m.fetchWithSession(url([a.id], ["posts/images"]));
    expect(response.headers.get("content-type")).toBe("application/zip");
    const data = new Uint8Array(await response.arrayBuffer());
    expect(data.slice(0, 4)).toEqual(new Uint8Array([80, 75, 3, 4]));
    const archive = new TextDecoder().decode(data);
    expect(archive).toContain("images/a.txt");
    expect(archive).toContain("images/trips/b.txt");
    expect(archive).toContain("first payload");
    expect(archive).toContain("second payload");
    expect(archive).not.toContain("secret.txt");
    expect(archive).not.toContain(".variants");
  });

  it("uses storage streams lazily and cancels the active source", async () => {
    const storage = local({ dir: tmpDir() });
    const m = withMedia({ storage });
    await m.cms.media.upload(text("a"), {
      filename: "a.txt",
      folder: "images",
      mimeType: "text/plain",
    });
    await m.cms.media.upload(text("b"), {
      filename: "b.txt",
      folder: "images",
      mimeType: "text/plain",
    });
    await m.client.signUp(admin);
    const cancel = vi.fn();
    const get = vi.spyOn(storage, "get").mockImplementation(async () => ({
      size: 1,
      body: new ReadableStream<Uint8Array>({
        pull(controller) {
          controller.enqueue(text("a"));
        },
        cancel,
      }),
    }));
    const response = await m.fetchWithSession(url([], ["images"]));
    const reader = response.body!.getReader();
    for (let i = 0; i < 12 && !get.mock.calls.length; i++) await reader.read();
    expect(get).toHaveBeenCalledOnce();
    await reader.cancel();
    expect(get.mock.calls.length).toBeLessThanOrEqual(1);
    expect(cancel).toHaveBeenCalledOnce();
    get.mockRestore();
  });

  it("does not silently finish an archive when a stored file is missing", async () => {
    const storage = local({ dir: tmpDir() });
    const m = withMedia({ storage });
    const doc = await m.cms.media.upload(text("a"), {
      filename: "a.txt",
      folder: "images",
      mimeType: "text/plain",
    });
    await storage.delete(doc.key);
    await m.client.signUp(admin);
    const response = await m.fetchWithSession(url([], ["images"]));
    await expect(response.arrayBuffer()).rejects.toThrow();
  });
});
