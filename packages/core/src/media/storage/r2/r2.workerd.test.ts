import { runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { r2 } from "./index.ts";

const MB = 1024 ** 2;
const storage = r2(env.MEDIA);
const text = async (s: ReadableStream) => new TextDecoder().decode(await new Response(s).bytes());
const stream = (bytes: Uint8Array<ArrayBuffer>) => new Blob([bytes]).stream();

async function upload(key: string, size: number) {
  const bytes = new Uint8Array(size).map((_, i) => i % 251);
  const parts = Math.ceil(size / storage.partSize);
  const { uploadId } = await storage.createUpload(key, { size, mimeType: "image/png", parts });
  const etags = [];
  for (let n = parts; n >= 1; n--) {
    const part = bytes.slice((n - 1) * storage.partSize, n * storage.partSize);
    const { etag } = await storage.putPart!(key, uploadId, n, stream(part), storage.partSize);
    etags.push({ n, etag });
  }
  return { bytes, ...(await storage.complete(key, uploadId, etags)) };
}

describe("r2", () => {
  it("uploads parts out of order through the binding", { timeout: 60_000 }, async () => {
    const { bytes, size } = await upload("a/big.png", 5 * MB + 3);
    expect(size).toBe(bytes.length);
    const file = await storage.get("a/big.png");
    expect(new Uint8Array(await new Response(file!.body).arrayBuffer())).toEqual(bytes);
    expect((await env.MEDIA.head("a/big.png"))?.httpMetadata?.contentType).toBe("image/png");
  });

  it("stops a part at maxBytes", async () => {
    const { uploadId } = await storage.createUpload("x.txt", {
      size: 4,
      mimeType: "text/plain",
      parts: 1,
    });
    const body = stream(new TextEncoder().encode("toolong"));
    await expect(storage.putPart!("x.txt", uploadId, 1, body, 4)).rejects.toThrow();
    await storage.abort("x.txt", uploadId);
  });

  it("gets a file or a range of it, and nothing for a missing key", async () => {
    await storage.put("r.txt", new TextEncoder().encode("abcdef"), "text/plain");
    const range = await storage.get("r.txt", { start: 1, end: 3 });
    expect([await text(range!.body), range!.size]).toEqual(["bcd", 6]);
    expect(await storage.get("missing.txt")).toBeUndefined();
  });

  it("lists, moves and deletes, and ignores missing keys", async () => {
    await storage.put("l/a.txt", new TextEncoder().encode("a"), "text/plain");
    await storage.put("l/b/c.txt", new TextEncoder().encode("c"), "text/plain");
    expect((await storage.list("l/")).sort()).toEqual(["l/a.txt", "l/b/c.txt"]);

    await storage.move("l/a.txt", "m/a.txt");
    expect(await text((await storage.get("m/a.txt"))!.body)).toBe("a");
    expect(await storage.get("l/a.txt")).toBeUndefined();
    expect((await env.MEDIA.head("m/a.txt"))?.httpMetadata?.contentType).toBe("text/plain");

    await storage.delete("m/a.txt");
    expect(await storage.get("m/a.txt")).toBeUndefined();
    await storage.move("nope", "nope2");
    await storage.delete("nope");
  });

  it("serves files through core unless a public URL is set", () => {
    expect(storage.url("a b/x.png")).toBe("/_tenon/media/files/a%20b/x.png");
    expect(r2(env.MEDIA, { publicUrl: "https://media.test/" }).url("x.png")).toBe(
      "https://media.test/x.png",
    );
  });
});

describe("r2 inside a Durable Object transaction", () => {
  // The CMS moves a file while its write is open, and with a Durable Object database that write is a transaction.
  it("moves a file of one part and a file of several parts", { timeout: 60_000 }, async () => {
    const storage = r2(env.MEDIA, { partSize: 5 * MB });
    const big = new Uint8Array(5 * MB + 3).map((_, i) => i % 251);
    await storage.put("t/small.txt", new TextEncoder().encode("small"), "text/plain");
    await storage.put("t/big.png", big, "image/png");

    await runInDurableObject(env.CMS.getByName(crypto.randomUUID()), (_, state) =>
      state.storage.transaction(async () => {
        await storage.move("t/small.txt", "u/small.txt");
        await storage.move("t/big.png", "u/big.png");
      }),
    );

    expect(await text((await storage.get("u/small.txt"))!.body)).toBe("small");
    const moved = await storage.get("u/big.png");
    expect(new Uint8Array(await new Response(moved!.body).arrayBuffer())).toEqual(big);
    expect((await env.MEDIA.head("u/big.png"))?.httpMetadata?.contentType).toBe("image/png");
    expect(await storage.get("t/big.png")).toBeUndefined();
  });
});
