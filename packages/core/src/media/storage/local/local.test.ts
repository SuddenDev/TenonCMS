import { existsSync } from "node:fs";
import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { local } from "./index.ts";

const stream = (bytes: Uint8Array<ArrayBuffer>) => new Blob([bytes]).stream();
const text = async (s: ReadableStream) => new TextDecoder().decode(await new Response(s).bytes());
const input = new TextEncoder().encode("aaaabbbbcc");

let dir: string;
let storage: ReturnType<typeof local>;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "tenon-local-"));
  storage = local({ dir, partSize: 4 });
});

async function upload(key: string) {
  const { uploadId } = await storage.createUpload(key, {
    size: 10,
    mimeType: "text/plain",
    parts: 3,
  });
  for (const n of [3, 1, 2, 2])
    await storage.putPart!(key, uploadId, n, stream(input.slice((n - 1) * 4, n * 4)), 4);
  return storage.complete(key, uploadId, []);
}

describe("local", () => {
  it("writes parts out of order and twice, then moves the file into place", async () => {
    expect(await upload("a/b/file.txt")).toEqual({ size: 10 });
    expect(await readFile(join(dir, "a/b/file.txt"), "utf8")).toBe("aaaabbbbcc");
    expect(await readdir(join(dir, ".tmp"))).toEqual([]);
  });

  it("stops a part at maxBytes", async () => {
    const { uploadId } = await storage.createUpload("x.txt", {
      size: 4,
      mimeType: "text/plain",
      parts: 1,
    });
    await expect(storage.putPart!("x.txt", uploadId, 1, stream(input), 4)).rejects.toThrow();
    const [tmp] = await readdir(join(dir, ".tmp"));
    expect((await readFile(join(dir, ".tmp", tmp))).length).toBeLessThanOrEqual(4);
  });

  it("aborts an upload", async () => {
    const { uploadId } = await storage.createUpload("x.txt", {
      size: 4,
      mimeType: "text/plain",
      parts: 1,
    });
    await storage.abort("x.txt", uploadId);
    expect(await readdir(join(dir, ".tmp"))).toEqual([]);
  });

  it("gets a file or a range of it", async () => {
    await upload("file.txt");
    const whole = await storage.get("file.txt");
    expect(whole?.size).toBe(10);
    expect(await text(whole!.body)).toBe("aaaabbbbcc");
    const part = await storage.get("file.txt", { start: 2, end: 5 });
    expect(part?.size).toBe(10);
    expect(await text(part!.body)).toBe("aabb");
    expect(await storage.get("missing.txt")).toBeUndefined();
  });

  it("puts, moves and deletes, pruning empty folders", async () => {
    await storage.put("a/b/x.txt", input, "text/plain");
    await storage.move("a/b/x.txt", "c/d/y.txt");
    expect(await readFile(join(dir, "c/d/y.txt"), "utf8")).toBe("aaaabbbbcc");
    expect(existsSync(join(dir, "a"))).toBe(false);
    await storage.move("missing.txt", "other.txt");
    await storage.delete("c/d/y.txt");
    expect(existsSync(join(dir, "c"))).toBe(false);
    expect(existsSync(dir)).toBe(true);
    await storage.delete("missing.txt");
  });

  it("lists the keys under a prefix, recursively", async () => {
    await storage.put(".variants/a/x.png/f_webp&w_1", input, "image/webp");
    await storage.put(".variants/a/x.png/f_webp&w_2", input, "image/webp");
    await storage.put(".variants/a/y.png/f_webp&w_1", input, "image/webp");
    expect((await storage.list(".variants/a/x.png/")).sort()).toEqual([
      ".variants/a/x.png/f_webp&w_1",
      ".variants/a/x.png/f_webp&w_2",
    ]);
    expect(await storage.list(".variants/")).toHaveLength(3);
    expect(await storage.list("missing/")).toEqual([]);
  });

  it("rejects keys outside dir", async () => {
    await expect(storage.put("../x.txt", input, "text/plain")).rejects.toThrow();
  });

  it("builds URLs", () => {
    expect(storage.url("a b/é.jpg")).toBe("/_tenon/media/files/a%20b/%C3%A9.jpg");
    expect(local({ dir, baseUrl: "https://cdn.example.com/u" }).url("a/b.jpg")).toBe(
      "https://cdn.example.com/u/a/b.jpg",
    );
  });
});

describe("local options", () => {
  it("reports a missing dir instead of throwing", () => {
    expect(local({ dir: undefined as unknown as string }).problems).toEqual(["`dir` is missing"]);
  });
});
