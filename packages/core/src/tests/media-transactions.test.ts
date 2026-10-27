import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { HookArgs } from "../schema/hooks/index.ts";
import { png } from "./fixtures.ts";
import { local } from "../media/storage/local/index.ts";
import { admin, tmpDir, withMedia } from "./setup.ts";

const data = new TextEncoder().encode("hello");
const info = { filename: "a.txt", mimeType: "text/plain" };

describe("media transaction lifetime", () => {
  it("keeps a nested deletion's files and hooks pending until outer commit", async () => {
    let id = "";
    let fail = true;
    const afterDelete = vi.fn();
    const env = withMedia(
      { hooks: { afterDelete: [afterDelete] } },
      {
        hooks: {
          afterChange: [
            async ({ cms }: HookArgs) => {
              await cms.media!.delete(id);
              expect(existsSync(join(env.dir, "a.txt"))).toBe(true);
              expect(afterDelete).not.toHaveBeenCalled();
              if (fail) throw new Error("outer failure");
            },
          ],
        },
      },
    );
    id = (await env.cms.media.upload(data, info)).id;

    await expect(env.cms.create("posts", {})).rejects.toThrow("outer failure");
    expect(await env.cms.findById("media", id)).toBeDefined();
    expect(existsSync(join(env.dir, "a.txt"))).toBe(true);
    expect(afterDelete).not.toHaveBeenCalled();

    fail = false;
    await env.cms.create("posts", {});
    expect(await env.cms.findById("media", id)).toBeUndefined();
    expect(existsSync(join(env.dir, "a.txt"))).toBe(false);
    expect(afterDelete).toHaveBeenCalledOnce();
  });

  it("reverses multiple nested moves after outer rollback", async () => {
    let id = "";
    const env = withMedia(
      {},
      {
        hooks: {
          afterChange: [
            async ({ cms }: HookArgs) => {
              await cms.media!.update(id, { filename: "b.txt" });
              await cms.media!.update(id, { filename: "c.txt" });
              throw new Error("outer failure");
            },
          ],
        },
      },
    );
    id = (await env.cms.media.upload(data, info)).id;
    await expect(env.cms.create("posts", {})).rejects.toThrow("outer failure");
    expect((await env.cms.findById("media", id))?.key).toBe("a.txt");
    expect(readdirSync(env.dir)).toContain("a.txt");
    expect(existsSync(join(env.dir, "b.txt"))).toBe(false);
    expect(existsSync(join(env.dir, "c.txt"))).toBe(false);
  });

  it("cleans a completed nested upload after outer rollback", async () => {
    const env = withMedia(
      {},
      {
        hooks: {
          afterChange: [
            async ({ cms }: HookArgs) => {
              await cms.media!.upload(data, info);
              throw new Error("outer failure");
            },
          ],
        },
      },
    );
    await expect(env.cms.create("posts", {})).rejects.toThrow("outer failure");
    expect(await env.cms.find("media")).toEqual([]);
    expect(existsSync(join(env.dir, "a.txt"))).toBe(false);
  });

  it("does not commit when a hook catches a failed nested write", async () => {
    const env = withMedia(
      {},
      {
        hooks: {
          afterChange: [
            async ({ cms, collection }: HookArgs) => {
              if (collection === "posts")
                await cms.setGlobal("site", { name: "fail" }).catch(() => {});
            },
          ],
          beforeChange: [
            ({ data, global }: HookArgs & { data: Record<string, unknown> }) => {
              if (global === "site" && data.name === "fail") throw new Error("nested failure");
            },
          ],
        },
      },
    );
    await expect(env.cms.create("posts", {})).rejects.toThrow("nested failure");
    expect(await env.cms.find("posts")).toEqual([]);
    expect((await env.cms.getGlobal("site")).name).toBeUndefined();
  });

  it("runs afterDelete with a live API and never rolls back a committed hook failure", async () => {
    const env = withMedia({
      hooks: {
        afterDelete: [
          async ({ cms }: HookArgs) => {
            await cms.setGlobal("site", { name: "after commit" });
            throw new Error("commit hook failure");
          },
        ],
      },
    });
    const doc = await env.cms.media.upload(data, info);
    await expect(env.cms.media.delete(doc.id)).rejects.toThrow("commit hook failure");
    expect((await env.cms.getGlobal("site")).name).toBe("after commit");
    expect(await env.cms.findById("media", doc.id)).toBeUndefined();
    expect(existsSync(join(env.dir, "a.txt"))).toBe(false);
  });

  it("continues compensation after a storage failure and retains the write error", async () => {
    const dir = tmpDir();
    const storage = local({ dir });
    const env = withMedia(
      {
        storage: {
          ...storage,
          move: async (from, to) => {
            if (from === "c.txt") throw new Error("compensation failure");
            return storage.move(from, to);
          },
        },
      },
      {
        hooks: {
          afterChange: [
            async ({ cms }: HookArgs) => {
              const docs = (await cms.find("media")).sort((a, b) =>
                a.filename.localeCompare(b.filename),
              );
              await cms.media!.update(docs[0].id, { filename: "b.txt" });
              await cms.media!.update(docs[1].id, { filename: "c.txt" });
              throw new Error("original failure");
            },
          ],
        },
      },
    );
    await env.cms.media.upload(data, info);
    await env.cms.media.upload(data, { ...info, filename: "other.txt" });
    await expect(env.cms.create("posts", {})).rejects.toThrow("original failure");
    expect(existsSync(join(dir, "a.txt"))).toBe(true);
  });
});

describe("transaction failure boundaries", () => {
  it("continues committed cleanup after a failing afterDelete hook", async () => {
    const ids: string[] = [];
    const env = withMedia(
      {
        hooks: {
          afterDelete: [
            () => {
              throw new Error("commit failure");
            },
          ],
        },
      },
      {
        hooks: {
          afterChange: [
            async ({ cms }: HookArgs) => {
              for (const id of ids) await cms.media!.delete(id);
            },
          ],
        },
      },
    );
    ids.push((await env.cms.media.upload(data, info)).id);
    ids.push((await env.cms.media.upload(data, { ...info, filename: "b.txt" })).id);
    await expect(env.cms.create("posts", {})).rejects.toThrow("commit failure");
    expect(await env.cms.find("media")).toEqual([]);
    expect(existsSync(join(env.dir, "a.txt"))).toBe(false);
    expect(existsSync(join(env.dir, "b.txt"))).toBe(false);
    expect(await env.cms.find("posts")).toHaveLength(1);
  });

  it.each(["collection", "upload", "move", "stream"])(
    "aborts outer work after a caught early %s failure",
    async (kind) => {
      const env = withMedia(
        {},
        {
          hooks: {
            afterChange: [
              async ({ cms }: HookArgs) => {
                if (kind === "collection") await cms.create("missing", {}).catch(() => {});
                if (kind === "upload")
                  await cms.media!.upload(data, { ...info, mimeType: "invalid" }).catch(() => {});
                if (kind === "move") {
                  const doc = (await cms.find("media"))[0];
                  await cms.media!.update(doc.id, { folder: "../bad" }).catch(() => {});
                }
                if (kind === "stream") {
                  const stream = new ReadableStream<Uint8Array>({
                    start(controller) {
                      controller.error(new Error("stream failed"));
                    },
                  });
                  await cms.media!.upload(stream, { ...info, size: data.length }).catch(() => {});
                }
              },
            ],
          },
        },
      );
      if (kind === "move") await env.cms.media.upload(data, info);
      await expect(env.cms.create("posts", {})).rejects.toThrow();
      expect(await env.cms.find("posts")).toEqual([]);
    },
  );
});

it("aborts resources and releases an existing multipart reservation when assembly fails", async () => {
  const dir = tmpDir();
  const storage = local({ dir });
  const env = withMedia({
    storage: {
      ...storage,
      complete: async () => {
        throw new Error("assembly failure");
      },
    },
  });
  await env.client.signUp(admin);
  const json = (body: unknown) => ({
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const plan = await (
    await env.fetchWithSession("/media/uploads", json({ ...info, size: data.length }))
  ).json();
  const put = await env.fetchWithSession(`/media/uploads/${plan.id}/parts/1`, {
    method: "PUT",
    body: data,
  });
  const { etag } = await put.json();
  expect(
    (
      await env.fetchWithSession(
        `/media/uploads/${plan.id}/complete`,
        json({ parts: [{ n: 1, etag }] }),
      )
    ).status,
  ).toBe(500);
  expect(readdirSync(join(dir, ".tmp"))).toEqual([]);
  expect(
    (
      await env.fetchWithSession(
        `/media/uploads/${plan.id}/complete`,
        json({ parts: [{ n: 1, etag }] }),
      )
    ).status,
  ).toBe(404);
});

it.each([false, true])(
  "reserves a deleted key until finalization (rollback: %s)",
  async (rollback) => {
    let id = "";
    let replacement = "";
    const env = withMedia(
      {},
      {
        hooks: {
          afterChange: [
            async ({ cms }: HookArgs) => {
              await cms.media!.delete(id);
              replacement = (await cms.media!.upload(data, info)).key;
              if (rollback) throw new Error("rollback");
            },
          ],
        },
      },
    );
    id = (await env.cms.media.upload(data, info)).id;
    const write = env.cms.create("posts", {});
    if (rollback) await expect(write).rejects.toThrow("rollback");
    else await write;
    expect(replacement).toBe("a-1.txt");
    expect(existsSync(join(env.dir, "a.txt"))).toBe(rollback);
    expect(existsSync(join(env.dir, "a-1.txt"))).toBe(!rollback);
  },
);

it("rejects moves to a key pending deletion without losing the original bytes", async () => {
  const ids: string[] = [];
  const env = withMedia(
    {},
    {
      hooks: {
        afterChange: [
          async ({ cms }: HookArgs) => {
            await cms.media!.delete(ids[0]);
            await cms.media!.update(ids[1], { filename: "a.txt" });
          },
        ],
      },
    },
  );
  ids.push((await env.cms.media.upload(data, info)).id);
  ids.push((await env.cms.media.upload(data, { ...info, filename: "b.txt" })).id);
  await expect(env.cms.create("posts", {})).rejects.toMatchObject({
    errors: { filename: "Already used" },
  });
  expect(existsSync(join(env.dir, "a.txt"))).toBe(true);
  expect(existsSync(join(env.dir, "b.txt"))).toBe(true);
  expect(await env.cms.find("media")).toHaveLength(2);
});

it("reserves deletion keys before reference-effect hooks run", async () => {
  const imageInfo = { filename: "a.png", mimeType: "image/png" };
  let deleting = false;
  let replacement = "";
  const env = withMedia(
    {},
    {
      hooks: {
        afterChange: [
          async ({ cms }: HookArgs) => {
            if (deleting) replacement = (await cms.media!.upload(png, imageInfo)).key;
          },
        ],
      },
    },
  );
  const doc = await env.cms.media.upload(png, imageInfo);
  await env.cms.create("posts", { og: doc.id });
  deleting = true;
  await env.cms.media.delete(doc.id);
  expect(replacement).toBe("a-1.png");
  expect(existsSync(join(env.dir, replacement))).toBe(true);
});

it("keeps later deletion keys reserved inside fresh commit hooks", async () => {
  const ids: string[] = [];
  let replacement = "";
  const env = withMedia(
    {
      hooks: {
        afterDelete: [
          async ({ cms, doc }) => {
            if (doc.filename === "a.txt")
              replacement = (await cms.media!.upload(data, { ...info, filename: "b.txt" })).key;
          },
        ],
      },
    },
    {
      hooks: {
        afterChange: [
          async ({ cms }: HookArgs) => {
            for (const id of ids) await cms.media!.delete(id);
          },
        ],
      },
    },
  );
  ids.push((await env.cms.media.upload(data, info)).id);
  ids.push((await env.cms.media.upload(data, { ...info, filename: "b.txt" })).id);
  await env.cms.create("posts", {});
  expect(replacement).toBe("b-1.txt");
  expect(existsSync(join(env.dir, replacement))).toBe(true);
  expect((await env.cms.find("media"))[0].key).toBe(replacement);
});

it("prerenders the current key after an uploaded file moves before outer commit", async () => {
  const render = vi.fn(async () => ({ data: png, mimeType: "image/webp" }));
  const env = withMedia(
    {
      images: {
        sizes: [100],
        provider: {
          prerender: true,
          getImage: ({ url }) => ({ url }),
          render,
        },
      },
    },
    {
      hooks: {
        afterChange: [
          async ({ cms }: HookArgs) => {
            const doc = await cms.media!.upload(png, { filename: "a.png", mimeType: "image/png" });
            await cms.media!.update(doc.id, { filename: "b.png" });
            expect(render).not.toHaveBeenCalled();
          },
        ],
      },
    },
  );
  await env.cms.create("posts", {});
  expect(render).toHaveBeenCalledWith("b.png", expect.any(Object), expect.any(Object));
  expect(existsSync(join(env.dir, ".variants/b.png/f_webp&q_85&w_100"))).toBe(true);
});
