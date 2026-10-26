import { describe, expect, it } from "vitest";
import { defineCms, LinkedContentError, ValidationError } from "../index.ts";
import { base } from "./setup.ts";

const make = () =>
  defineCms({
    ...base,
    media: false,
    settings: false,
    collections: {
      pages: { permalink: "/{slug}", fields: { title: { type: "text" }, slug: { type: "slug" } } },
      articles: {
        fields: { title: { type: "text" }, body: { type: "richtext", allowed: ["link", "bold"] } },
      },
    },
  });
const link = (id: string, extra = {}) => ({
  type: "doc" as const,
  content: [
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "Read more",
          marks: [
            {
              type: "link",
              attrs: {
                reference: { collection: "pages", id, ...extra },
                target: "_blank",
                rel: "noopener noreferrer",
              },
            },
          ],
        },
      ],
    },
  ],
});

describe("rich text relations", () => {
  it("stores JSON and resolves the current permalink only when populated", async () => {
    const cms = make();
    const page = await cms.create("pages", { title: "About", slug: "about" });
    const article = await cms.create("articles", { body: link(page.id) });
    const stored = await cms.findById("articles", article.id, { populate: false });

    expect(stored?.body).toEqual(link(page.id));

    const read = await cms.findById("articles", article.id);

    expect(read?.body?.content?.[0].content?.[0].marks?.[0].attrs?.href).toBe("/about");

    await cms.update("pages", page.id, { slug: "about-us" });

    expect(
      (await cms.findById("articles", article.id))?.body?.content?.[0].content?.[0].marks?.[0].attrs
        ?.href,
    ).toBe("/about-us");
  });

  it("warns transactionally before deletion and preserves repairable broken links", async () => {
    const cms = make();
    const page = await cms.create("pages", { slug: "about" });
    const article = await cms.create("articles", { body: link(page.id) });

    await expect(cms.delete("pages", page.id)).rejects.toBeInstanceOf(LinkedContentError);
    expect(await cms.findById("pages", page.id)).toBeDefined();

    await cms.delete("pages", page.id, { allowBrokenLinks: true });

    const raw = await cms.findById("articles", article.id, { populate: false });

    expect(raw?.body?.content?.[0].content?.[0].marks?.[0].attrs?.reference).toEqual({
      collection: "pages",
      id: page.id,
      deleted: true,
    });
    await expect(
      cms.update("articles", article.id, { title: "Still editable", body: raw!.body }),
    ).resolves.toBeDefined();

    const read = await cms.findById("articles", article.id);

    expect(read?.body?.content?.[0].content?.[0].marks?.[0].attrs).toMatchObject({
      href: null,
      broken: true,
    });
  });

  it("rejects unknown targets and forged deletion markers, including in drafts", async () => {
    const cms = make();

    await expect(cms.create("articles", { body: link("missing") })).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(
      cms.create("articles", { body: link("missing", { deleted: true }) }, { draft: true }),
    ).rejects.toBeInstanceOf(ValidationError);

    const draft = await cms.create("articles", { body: link("missing") }, { draft: true });

    await expect(cms.publish("articles", draft.id)).rejects.toBeInstanceOf(ValidationError);
  });

  it("checks the feature policy when publishing a loosely validated draft", async () => {
    const cms = make();
    const draft = await cms.create(
      "articles",
      {
        body: {
          type: "doc",
          content: [
            {
              type: "heading",
              attrs: { level: 1 },
              content: [{ type: "text", text: "Not allowed" }],
            },
          ],
        },
      },
      { draft: true },
    );

    await expect(cms.publish("articles", draft.id)).rejects.toBeInstanceOf(ValidationError);
  });
});

it("protects search and resolution endpoints and returns grouped, bounded results", async () => {
  const { setup, admin } = await import("./setup.ts");
  const cms = make();
  const { client } = setup(cms);

  await expect(client.richtext.search()).rejects.toMatchObject({ status: 401 });

  const page = await cms.create("pages", { title: "About us", slug: "about" });
  await cms.create("pages", { title: "Different", slug: "different" });
  await client.signUp(admin);

  const groups = await client.richtext.search({ query: "ABOUT" });

  expect(groups).toEqual([
    { collection: "pages", label: "pages", items: [{ id: page.id, label: "About us" }] },
  ]);

  const resolved = await client.richtext.resolve(link(page.id));

  expect(resolved.content?.[0].content?.[0].marks?.[0].attrs?.href).toBe("/about");

  const article = await client.create("articles", { body: link(page.id) });

  await expect(client.delete("pages", page.id)).rejects.toMatchObject({
    status: 409,
    body: {
      code: "LINKED_CONTENT",
      references: [{ collection: "articles", id: article.id, field: "body", draft: false }],
    },
  });

  await client.delete("pages", page.id, { allowBrokenLinks: true });

  expect(
    (await client.findById("articles", article.id))?.body?.content?.[0].content?.[0].marks?.[0]
      .attrs?.broken,
  ).toBe(true);
});

it("searches and resolves in the perspective of the preview cookie", async () => {
  const { setup, admin } = await import("./setup.ts");
  const cms = make();
  const { client } = setup(cms);
  await client.signUp(admin);
  const page = await cms.create("pages", { title: "Draft page", slug: "draft" }, { draft: true });
  const found = async () => (await client.richtext.search({ query: "draft" }))[0].items;
  const href = async () =>
    (await client.richtext.resolve(link(page.id))).content?.[0].content?.[0].marks?.[0].attrs?.href;

  expect(await found()).toEqual([]);
  expect(await href()).toBeNull();
  await client.preview.enter("drafts");
  expect(await found()).toEqual([{ id: page.id, label: "Draft page" }]);
  expect(await href()).toBe("/draft");
});

it("tracks nested references in published content, globals and every locale draft", async () => {
  const cms = defineCms({
    ...base,
    media: false,
    settings: false,
    localization: { locales: ["en", "de"], defaultLocale: "en" },
    collections: {
      pages: { localized: true, permalink: "/{slug}", fields: { slug: { type: "slug" } } },
      articles: {
        localized: true,
        fields: { sections: { type: "array", fields: { body: { type: "richtext" } } } },
      },
    },
    globals: { navigation: { localized: true, fields: { body: { type: "richtext" } } } },
  });
  const page = await cms.create("pages", { slug: "about" });
  const article = await cms.create("articles", { sections: [{ body: link(page.id) }] });
  await cms.update(
    "articles",
    article.id,
    { sections: [{ body: link(page.id) }] },
    { locale: "de", draft: true },
  );
  await cms.setGlobal("navigation", { body: link(page.id) }, { locale: "de", draft: true });

  await expect(cms.delete("pages", page.id)).rejects.toMatchObject({
    references: expect.arrayContaining([
      expect.objectContaining({
        collection: "articles",
        id: article.id,
        locale: "en",
        draft: false,
      }),
      expect.objectContaining({
        collection: "articles",
        id: article.id,
        locale: "de",
        draft: true,
      }),
      expect.objectContaining({ global: "navigation", locale: "de", draft: true }),
    ]),
  });

  await cms.delete("pages", page.id, { allowBrokenLinks: true });

  await expect(cms.publish("articles", article.id, { locale: "de" })).resolves.toBeDefined();
  await expect(cms.publishGlobal("navigation", { locale: "de" })).resolves.toBeDefined();
});

it("warns when discarding an unpublished link target and preserves ordinary restrictions", async () => {
  const cms = make();
  const page = await cms.create("pages", { slug: "draft" }, { draft: true });
  await cms.create("articles", { body: link(page.id) }, { draft: true });

  await expect(cms.discard("pages", page.id)).rejects.toBeInstanceOf(LinkedContentError);

  await cms.discard("pages", page.id, { allowBrokenLinks: true });

  expect(await cms.withDrafts().findById("pages", page.id)).toBeUndefined();
});

it("retains media restrictions and rolls back broken markers when deletion fails", async () => {
  const { local } = await import("../media/storage/local/index.ts");
  const { tmpDir } = await import("./setup.ts");
  const { png } = await import("./fixtures.ts");
  const { ConflictError } = await import("../index.ts");
  const cms = defineCms({
    ...base,
    settings: false,
    media: { storage: local({ dir: tmpDir() }) },
    collections: { articles: { fields: { body: { type: "richtext" }, hero: { type: "image" } } } },
  });
  const media = await cms.media.upload(png, { filename: "test.png", mimeType: "image/png" });
  const body = {
    type: "doc" as const,
    content: [{ type: "image", attrs: { reference: { collection: "media", id: media.id } } }],
  };
  const article = await cms.create("articles", { body, hero: media.id });

  await expect(cms.media.delete(media.id, { allowBrokenLinks: true })).rejects.toBeInstanceOf(
    ConflictError,
  );
  expect((await cms.findById("articles", article.id, { populate: false }))?.body).toEqual(body);
  expect((await cms.findById("articles", article.id))?.body?.content?.[0].attrs?.src).toBeTruthy();

  await cms.update("articles", article.id, { hero: null });

  await expect(cms.media.delete(media.id)).rejects.toBeInstanceOf(LinkedContentError);

  await cms.media.delete(media.id, { allowBrokenLinks: true });

  expect((await cms.findById("articles", article.id))?.body?.content?.[0].attrs).toMatchObject({
    src: null,
    broken: true,
    reference: { collection: "media", id: media.id, deleted: true },
  });
});

it("validates plugin content and preserves it on unrelated writes after the plugin is removed", async () => {
  const { Node } = await import("@tiptap/core");
  const { clientRef } = await import("../admin/config.ts");
  const { tmpDb } = await import("./setup.ts");
  const database = { url: tmpDb() };
  const collections = {
    articles: { fields: { title: { type: "text" as const }, body: { type: "richtext" as const } } },
  };
  const Notice = Node.create({ name: "notice", group: "block", content: "inline*" });
  const cms = defineCms({
    ...base,
    database,
    media: false,
    settings: false,
    collections,
    admin: {
      richtext: { extensions: { notice: { schema: Notice, client: clientRef("./notice.ts") } } },
    },
  });
  const body = {
    type: "doc" as const,
    content: [{ type: "notice", content: [{ type: "text", text: "Keep me" }] }],
  };
  const article = await cms.create("articles", { body });
  const without = defineCms({ ...base, database, media: false, settings: false, collections });
  await without.update("articles", article.id, { title: "Unrelated edit" });

  expect((await without.findById("articles", article.id, { populate: false }))?.body).toEqual(body);
  await expect(without.create("articles", { body })).rejects.toBeInstanceOf(ValidationError);
  await expect(
    without.update("articles", article.id, {
      body: {
        ...body,
        content: [{ type: "notice", content: [{ type: "text", text: "Changed" }] }],
      },
    }),
  ).rejects.toBeInstanceOf(ValidationError);
  expect(() =>
    defineCms({
      ...base,
      media: false,
      admin: {
        richtext: {
          extensions: {
            other: {
              schema: Node.create({ name: "paragraph", group: "block" }),
              client: clientRef("./other.ts"),
            },
          },
        },
      },
    }),
  ).toThrow(/duplicate Tiptap extension/);
});

it("owns safe relationship attributes for external new-tab links", async () => {
  const cms = make();
  const article = await cms.create("articles", {
    body: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "External",
              marks: [
                {
                  type: "link",
                  attrs: { href: "https://example.com", target: "_blank", rel: "opener" },
                },
              ],
            },
          ],
        },
      ],
    },
  });

  expect(article.body?.content?.[0].content?.[0].marks?.[0].attrs?.rel).toBe("noopener noreferrer");
});
