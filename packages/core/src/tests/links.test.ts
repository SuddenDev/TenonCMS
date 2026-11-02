import { describe, expect, it } from "vitest";
import { defineCms, LinkedContentError, ValidationError } from "../index.ts";
import { admin, base, setup } from "./setup.ts";

const make = () =>
  defineCms({
    ...base,
    media: false,
    settings: false,
    localization: { locales: ["en", "de"], defaultLocale: "en" },
    collections: {
      pages: {
        localized: true,
        permalink: "/{slug}",
        titleField: "title",
        fields: { title: { type: "text" }, slug: { type: "slug", localized: false } },
      },
      notes: { fields: { title: { type: "text" } } },
      articles: {
        fields: {
          title: { type: "text" },
          cta: { type: "link" },
          sections: {
            type: "array",
            fields: { link: { type: "link", required: true } },
          },
          content: {
            type: "blocks",
            blocks: {
              card: {
                fields: {
                  box: { type: "group", fields: { link: { type: "link" } } },
                  children: {
                    type: "blocks",
                    blocks: { card: { fields: { link: { type: "link" } } } },
                  },
                },
              },
            },
          },
        },
      },
    },
    globals: {
      nav: { fields: { cta: { type: "link" } } },
      menu: { localized: true, fields: { cta: { type: "link" } } },
    },
  });
const to = (id: string) => ({ reference: { collection: "pages", id } });

describe("link values", () => {
  it("resolves top-level and nested links in collections and globals", async () => {
    const cms = make();
    const page = await cms.create("pages", { title: "About", slug: "about" });
    const article = await cms.create("articles", {
      cta: to(page.id),
      sections: [{ link: { href: "https://example.com", target: "_blank" } }],
      content: [
        {
          blockType: "card",
          box: { link: to(page.id) },
          children: [{ blockType: "card", link: to(page.id) }],
        },
      ],
    });
    await cms.setGlobal("nav", { cta: to(page.id) });

    const read = await cms.findById("articles", article.id);

    expect(read?.cta).toEqual({ ...to(page.id), href: "/about", title: "About" });
    expect(read?.sections?.[0].link).toEqual({ href: "https://example.com", target: "_blank" });
    expect(read?.content?.[0].box?.link).toMatchObject({ href: "/about", title: "About" });
    expect(read?.content?.[0].children?.[0].link).toMatchObject({ href: "/about" });
    expect((await cms.getGlobal("nav")).cta).toMatchObject({ href: "/about", title: "About" });
  });

  it("appends the suffix to the resolved href of a reference and of a URL", async () => {
    const cms = make();
    const page = await cms.create("pages", { title: "About", slug: "about" });
    const article = await cms.create("articles", {
      cta: { ...to(page.id), suffix: "?ref=nav#team" },
      sections: [{ link: { href: "https://example.com/a?x=1#old", suffix: "#team" } }],
    });

    const read = await cms.findById("articles", article.id);

    expect(read?.cta).toMatchObject({ href: "/about?ref=nav#team", suffix: "?ref=nav#team" });
    expect(read?.sections?.[0].link).toMatchObject({ href: "https://example.com/a?x=1#team" });
    expect((await cms.findById("articles", article.id, { populate: false }))?.cta).toEqual({
      ...to(page.id),
      suffix: "?ref=nav#team",
    });
  });

  it("keeps the suffix when a read value is saved again", async () => {
    const cms = make();
    const page = await cms.create("pages", { title: "About", slug: "about" });
    const article = await cms.create("articles", { cta: { ...to(page.id), suffix: "#team" } });
    const read = await cms.findById("articles", article.id);

    await cms.update("articles", article.id, { cta: read!.cta });

    expect((await cms.findById("articles", article.id, { populate: false }))?.cta).toEqual({
      ...to(page.id),
      suffix: "#team",
    });
  });

  it("returns the stored value with populate: false", async () => {
    const cms = make();
    const page = await cms.create("pages", { title: "About", slug: "about" });
    const article = await cms.create("articles", { cta: to(page.id) });

    expect((await cms.findById("articles", article.id, { populate: false }))?.cta).toEqual(
      to(page.id),
    );
  });

  it("strips read decoration on write", async () => {
    const cms = make();
    const page = await cms.create("pages", { title: "About", slug: "about" });
    const article = await cms.create("articles", { cta: to(page.id) });
    const read = await cms.findById("articles", article.id);

    await cms.update("articles", article.id, { cta: read!.cta });

    expect((await cms.findById("articles", article.id, { populate: false }))?.cta).toEqual(
      to(page.id),
    );
  });

  it("resolves href and title per locale with routing, also in an unlocalized global", async () => {
    const cms = make();
    const page = await cms.create("pages", { title: "About", slug: "about" });
    await cms.update("pages", page.id, { title: "Über uns" }, { locale: "de" });
    await cms.setGlobal("nav", { cta: to(page.id) });
    await cms.setGlobal("menu", { cta: to(page.id) }, { locale: "de" });

    expect((await cms.getGlobal("nav", { locale: "de" })).cta).toMatchObject({
      href: "/de/about",
      title: "Über uns",
    });
    expect((await cms.getGlobal("menu", { locale: "de" })).cta).toMatchObject({
      href: "/de/about",
      title: "Über uns",
    });
    expect((await cms.getGlobal("nav")).cta).toMatchObject({ href: "/about", title: "About" });

    const { client } = setup(cms);
    expect((await client.getGlobal("nav", { locale: "de" })).cta).toMatchObject({
      href: "/de/about",
      title: "Über uns",
    });
  });

  it("marks a target missing in the locale as broken without fallback", async () => {
    const cms = make();
    const page = await cms.create("pages", { title: "About", slug: "about" });
    await cms.setGlobal("nav", { cta: to(page.id) });

    expect((await cms.getGlobal("nav", { locale: "de" })).cta).toMatchObject({ href: "/de/about" });
    expect((await cms.getGlobal("nav", { locale: "de", fallback: false })).cta).toMatchObject({
      href: null,
      broken: true,
    });
  });

  it("marks unpublished targets as broken in public reads only", async () => {
    const cms = make();
    const page = await cms.create("pages", { title: "Draft", slug: "draft" }, { draft: true });
    const article = await cms.create("articles", { cta: to(page.id) }, { draft: true });

    expect((await cms.withDrafts().findById("articles", article.id))?.cta).toMatchObject({
      href: "/draft",
      title: "Draft",
    });
    await expect(cms.publish("articles", article.id)).resolves.toBeDefined();
    expect((await cms.findById("articles", article.id))?.cta).toEqual({
      ...to(page.id),
      href: null,
      broken: true,
    });
  });
});

describe("link validation", () => {
  it("rejects bad shapes, executable schemes and unknown collections at the positional path", async () => {
    const cms = make();
    const page = await cms.create("pages", { slug: "about" });

    await expect(
      cms.create("articles", { cta: { href: "javascript:alert(1)" } }),
    ).rejects.toMatchObject({
      errors: { cta: "Unsafe URL" },
    });
    await expect(
      cms.create("articles", { sections: [{ link: to(page.id) }, { link: { target: "_blank" } }] }),
    ).rejects.toMatchObject({ errors: { "sections.1.link": "Invalid link" } });
    await expect(
      cms.create(
        "articles",
        {
          content: [
            {
              blockType: "card",
              children: [
                { blockType: "card", link: { reference: { collection: "nope", id: "1" } } },
              ],
            },
          ],
        },
        { draft: true },
      ),
    ).rejects.toMatchObject({
      errors: { "content.0.children.0.link": 'Unknown collection "nope"' },
    });
    await expect(
      cms.create("articles", { cta: { reference: { collection: "notes", id: "1" } } }),
    ).rejects.toMatchObject({ errors: { cta: 'Unknown collection "notes"' } });
  });

  it("checks targets when publishing and keeps drafts loose", async () => {
    const cms = make();

    await expect(cms.create("articles", { cta: to("missing") })).rejects.toMatchObject({
      errors: { cta: 'Unknown id in "pages"' },
    });

    const draft = await cms.create("articles", { cta: to("missing") }, { draft: true });

    await expect(cms.publish("articles", draft.id)).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects forged deletion markers", async () => {
    const cms = make();
    const page = await cms.create("pages", { slug: "about" });

    await expect(
      cms.create(
        "articles",
        { cta: { reference: { collection: "pages", id: page.id, deleted: true } } },
        { draft: true },
      ),
    ).rejects.toMatchObject({ errors: { cta: "Deletion markers are owned by the server" } });
  });

  it("is neither filterable nor unique", () => {
    expect(() =>
      defineCms({
        ...base,
        media: false,
        collections: { pages: { fields: { cta: { type: "link", unique: true } } } },
      }),
    ).toThrow(/cannot be unique/);
  });
});

describe("link deletion", () => {
  it("throws LINKED_CONTENT and records deleted markers with allowBrokenLinks", async () => {
    const cms = make();
    const page = await cms.create("pages", { slug: "about" });
    const article = await cms.create("articles", {
      cta: to(page.id),
      content: [{ blockType: "card", children: [{ blockType: "card", link: to(page.id) }] }],
    });
    await cms.update("articles", article.id, { title: "Draft" }, { draft: true });
    await cms.setGlobal("menu", { cta: to(page.id) }, { locale: "de", draft: true });

    await expect(cms.delete("pages", page.id)).rejects.toMatchObject({
      references: expect.arrayContaining([
        { collection: "articles", id: article.id, field: "cta", draft: false },
        { collection: "articles", id: article.id, field: "content.0.children.0.link", draft: true },
        { global: "menu", locale: "de", field: "cta", draft: true },
      ]),
    });
    await expect(cms.delete("pages", page.id)).rejects.toBeInstanceOf(LinkedContentError);

    await cms.delete("pages", page.id, { allowBrokenLinks: true });

    const deleted = { reference: { collection: "pages", id: page.id, deleted: true } };
    const stored = await cms.findById("articles", article.id, { populate: false });
    expect(stored?.cta).toEqual(deleted);
    expect(stored?.content?.[0].children?.[0].link).toEqual(deleted);
    expect(
      (await cms.withDrafts().findById("articles", article.id, { populate: false }))?.cta,
    ).toEqual(deleted);
    expect(
      (await cms.withDrafts().getGlobal("menu", { locale: "de", populate: false })).cta,
    ).toEqual(deleted);
    expect((await cms.findById("articles", article.id))?.cta).toEqual({
      ...deleted,
      href: null,
      broken: true,
    });

    await expect(cms.update("articles", article.id, { cta: stored!.cta })).resolves.toBeDefined();
    await expect(cms.publishGlobal("menu", { locale: "de" })).resolves.toBeDefined();
  });
});

describe("client.links", () => {
  it("needs a session, searches titles and resolves references", async () => {
    const cms = make();
    const { client } = setup(cms);
    const page = await cms.create("pages", { title: "About us", slug: "about" });
    await cms.update("pages", page.id, { title: "Über uns" }, { locale: "de" });

    await expect(client.links.search()).rejects.toMatchObject({ status: 401 });
    await expect(client.links.resolve([to(page.id).reference])).rejects.toMatchObject({
      status: 401,
    });

    await client.signUp(admin);

    expect(await client.links.search({ query: "about" })).toEqual([
      { collection: "pages", label: "pages", items: [{ id: page.id, label: "About us" }] },
    ]);
    expect(
      await client.links.resolve([to(page.id).reference, { collection: "pages", id: "missing" }], {
        locale: "de",
      }),
    ).toEqual([
      { href: "/de/about", title: "Über uns" },
      { href: null, broken: true },
    ]);
    await expect(client.links.resolve([{ collection: 1 } as never])).rejects.toMatchObject({
      status: 400,
    });
  });

  it("reads in the perspective of the preview cookie", async () => {
    const cms = make();
    const { client } = setup(cms);
    await client.signUp(admin);
    const page = await cms.create("pages", { title: "Draft", slug: "draft" }, { draft: true });

    expect(await client.links.resolve([to(page.id).reference])).toEqual([
      { href: null, broken: true },
    ]);
    await client.preview.enter("drafts");
    expect(await client.links.resolve([to(page.id).reference])).toEqual([
      { href: "/draft", title: "Draft" },
    ]);
  });
});
