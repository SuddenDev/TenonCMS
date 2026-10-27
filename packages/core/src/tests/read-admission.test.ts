import { describe, expect, it, vi } from "vitest";
import type { FieldAccessArgs } from "../access/types.ts";
import { defineCms } from "../index.ts";
import { admin, base, setup, withMedia } from "./setup.ts";

const bytes = new TextEncoder().encode("secret");

describe("read admission", () => {
  it("denies literal-false media reads for files and downloads", async () => {
    const env = withMedia({ access: { read: false } });
    const doc = await env.cms.media.upload(bytes, {
      filename: "secret.txt",
      mimeType: "text/plain",
    });
    expect((await env.fetchWithSession("/media/files/secret.txt")).status).toBe(401);
    await env.client.signUp(admin);
    expect((await env.fetchWithSession("/media/files/secret.txt")).status).toBe(403);
    expect((await env.fetchWithSession(`/media/download?id=${doc.id}`)).status).toBe(403);
  });

  it.each(["document-dependent", "denied"])("does not search a %s title field", async (kind) => {
    const env = setup(
      defineCms({
        ...base,
        media: false,
        settings: false,
        collections: {
          pages: {
            titleField: "title",
            permalink: "/{slug}",
            fields: {
              title: {
                type: "text",
                ...(kind === "document-dependent"
                  ? { private: true, access: { read: ({ doc }: FieldAccessArgs) => !!doc } }
                  : { access: { read: false } }),
              },
              slug: { type: "slug" },
            },
          },
        },
      }),
    );
    await env.cms.create("pages", { title: "secret phrase", slug: "page" });
    await env.client.signUp(admin);
    const res = await env.fetch("http://localhost/api/cms/admin/richtext/targets?query=secret");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("passes explicit IDs and the current perspective to ordinary read rules", async () => {
    const read = vi.fn(() => true);
    const env = setup(
      defineCms({
        ...base,
        media: false,
        settings: false,
        collections: {
          pages: { fields: { title: { type: "text" } }, access: { read } },
        },
      }),
    );
    const doc = await env.cms.create("pages", { title: "page" });
    await env.client.findById("pages", doc.id);
    expect(read).toHaveBeenLastCalledWith(expect.objectContaining({ id: doc.id, draft: false }));
  });
});

it("skips a stale configured search field without failing other collections", async () => {
  const env = setup(
    defineCms({
      ...base,
      media: false,
      settings: false,
      collections: {
        pages: { titleField: "missing", permalink: "/{slug}", fields: { slug: { type: "slug" } } },
        posts: {
          permalink: "/posts/{slug}",
          fields: { title: { type: "text" }, slug: { type: "slug" } },
        },
      },
    }),
  );
  await env.cms.create("posts", { title: "find me", slug: "found" });
  await env.client.signUp(admin);
  const response = await env.fetch("http://localhost/api/cms/admin/richtext/targets?query=find");
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual([
    expect.objectContaining({
      collection: "posts",
      items: [expect.objectContaining({ label: "find me" })],
    }),
  ]);
});
