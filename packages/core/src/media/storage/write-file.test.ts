import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { local } from "./local/index.ts";
import { writeFile } from "./write-file.ts";

const storage = () => local({ dir: mkdtempSync(join(tmpdir(), "tenon-write-")), partSize: 4 });
const text = async (s: ReturnType<typeof storage>, key: string) =>
  new Response((await s.get(key))!.body).text();

describe("writeFile", () => {
  it("puts a stream of one part in one go", async () => {
    const s = storage();
    const multipart = vi.spyOn(s, "createUpload");

    await writeFile(s, "a.txt", new Blob(["abc"]).stream(), "text/plain");

    expect(await text(s, "a.txt")).toBe("abc");
    expect(multipart).not.toHaveBeenCalled();
  });

  it("writes a longer stream in parts", async () => {
    const s = storage();

    await writeFile(s, "b.txt", new Blob(["aaaa", "bbbbcc"]).stream(), "text/plain");

    expect(await text(s, "b.txt")).toBe("aaaabbbbcc");
  });

  it("aborts the upload when the stream fails", async () => {
    const s = storage();
    const abort = vi.spyOn(s, "abort");
    let pulls = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(c) {
        if (++pulls > 2) c.error(new Error("gone"));
        else c.enqueue(new Uint8Array(4));
      },
    });

    await expect(writeFile(s, "c.txt", body, "text/plain")).rejects.toThrow("gone");
    expect(abort).toHaveBeenCalled();
    expect(await s.get("c.txt")).toBeUndefined();
  });
});
