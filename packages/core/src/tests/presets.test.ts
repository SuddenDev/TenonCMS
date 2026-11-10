import { beforeEach, describe, expect, it } from "vitest";
import { defineCms, menuItems } from "../index.ts";
import {
  menu,
  menuPreset,
  nestedPaths,
  page,
  pagesPreset,
  seo,
  strings,
  stringsPreset,
} from "../presets/index.ts";
import type { Collection } from "../schema/index.ts";
import { admin, origin, setup, testDatabase, testDb } from "./setup.ts";

describe("page preset", () => {
  // A test sets it to fail the update of the page with that slug.
  let failSlug: string | undefined;
  const make = () =>
    defineCms({
      collections: {
        pages: {
          titleField: "title",
          fields: { ...page().fields, ...seo().fields, body: { type: "textarea" } },
          hooks: {
            afterChange: page().hooks.afterChange,
            beforeChange: {
              ...page().hooks.beforeChange,
              fail: ({ originalDoc }) => {
                if (originalDoc && originalDoc.slug === failSlug) throw new Error("boom");
              },
            },
          },
        },
      },
      database: testDatabase(),
      secret: "x".repeat(32),
    });
  let cms: ReturnType<typeof make>;
  beforeEach(() => {
    failSlug = undefined;
    cms = make();
  });
  const stored = async (id: string) => (await cms.findById("pages", id, { populate: false }))?.path;
  const paths = (...docs: Array<{ id: string }>) => Promise.all(docs.map((d) => stored(d.id)));
  const invalid = (field: string) => ({ errors: { [field]: expect.any(String) } });
  const tree = async () => {
    const about = await cms.create("pages", { title: "About", slug: "about" });
    const team = await cms.create("pages", { title: "Team", slug: "team", parent: about.id });
    const berlin = await cms.create("pages", { title: "Berlin", slug: "berlin", parent: team.id });
    return { about, team, berlin };
  };

  it("stores nested paths and overwrites a path in the input", async () => {
    const { about, team, berlin } = await tree();
    expect(await paths(about, team, berlin)).toEqual([
      "/about",
      "/about/team",
      "/about/team/berlin",
    ]);
    const home = await cms.create("pages", { title: "Home", slug: "index", path: "/x" });
    expect(await stored(home.id)).toBe("/");
    const p = await cms.create("pages", { title: "Über uns", slug: "", seo: { description: "D" } });
    expect(p).toMatchObject({ slug: "uber-uns", path: "/uber-uns", seo: { description: "D" } });
    await cms.update("pages", p.id, { title: "Über uns", slug: "uber-uns", path: "/y" });
    expect(await stored(p.id)).toBe("/uber-uns");
  });

  it("rejects an invalid slug and a duplicate path", async () => {
    const { about } = await tree();
    await expect(cms.create("pages", { title: "A", slug: "Not Valid" })).rejects.toMatchObject(
      invalid("slug"),
    );
    await expect(cms.create("pages", { title: "About", slug: "about" })).rejects.toMatchObject(
      invalid("slug"),
    );
    const contact = await cms.create("pages", { title: "Contact", slug: "contact" });
    await expect(
      cms.create("pages", { title: "Team", slug: "team", parent: contact.id }),
    ).resolves.toBeDefined();
    await expect(
      cms.update("pages", contact.id, { title: "Contact", slug: "about" }),
    ).rejects.toMatchObject(invalid("slug"));
    await expect(
      cms.update("pages", about.id, { title: "About", slug: "about" }),
    ).resolves.toBeDefined();
  });

  it("rejects moving a page under itself or its own descendant", async () => {
    const { about, berlin } = await tree();
    for (const parent of [berlin.id, about.id])
      await expect(
        cms.update("pages", about.id, { title: "About", slug: "about", parent }),
      ).rejects.toMatchObject(invalid("parent"));
    expect((await cms.findById("pages", about.id, { populate: false }))?.parent).toBeUndefined();
  });

  it("rewrites descendant paths on rename, and rolls back when one fails", async () => {
    const { about, team, berlin } = await tree();
    failSlug = "berlin";
    await expect(
      cms.update("pages", about.id, { title: "About", slug: "company" }),
    ).rejects.toThrow("boom");
    expect(await paths(about, team, berlin)).toEqual([
      "/about",
      "/about/team",
      "/about/team/berlin",
    ]);
    failSlug = undefined;
    await cms.update("pages", about.id, { title: "About", slug: "company" });
    expect(await paths(about, team, berlin)).toEqual([
      "/company",
      "/company/team",
      "/company/team/berlin",
    ]);
  });

  it("refuses to delete a page with children", async () => {
    const { about, team, berlin } = await tree();
    await expect(cms.delete("pages", about.id)).rejects.toMatchObject({
      references: [{ collection: "pages", id: team.id }],
    });
    await cms.delete("pages", berlin.id);
    expect(await cms.findById("pages", berlin.id)).toBeUndefined();
  });

  it("disables a hook omitted by name", async () => {
    const { uniquePath, ...beforeChange } = page().hooks.beforeChange;
    const cms = defineCms({
      collections: { pages: { fields: page().fields, hooks: { beforeChange } } },
      database: testDatabase(),
      secret: "x".repeat(32),
    });
    await cms.create("pages", { title: "About", slug: "about" });
    await expect(cms.create("pages", { title: "About", slug: "about" })).resolves.toMatchObject({
      path: "/about",
    });
  });

  it("nests pages of another collection", async () => {
    const docs = page({ collection: "docs" });
    const cms = defineCms({
      collections: { docs: { fields: docs.fields, hooks: docs.hooks } },
      database: testDatabase(),
      secret: "x".repeat(32),
    });
    const guide = await cms.create("docs", { title: "Guide", slug: "guide" });
    const start = await cms.create("docs", { title: "Start", slug: "start", parent: guide.id });

    expect(start.path).toBe("/guide/start");
    docs.fields.parent.collection satisfies "docs";
  });

  it("keeps the templates of seo() on the group, typed", () => {
    const { seo: group } = seo({ title: "{title} – Blog" }).fields;
    expect(group.templates).toEqual({ title: "{title} – Blog" });
    group.templates.title satisfies "{title} – Blog";
    expect(seo().fields.seo.templates).toEqual({});
  });

  it("reads a page by path over HTTP, and sends the seo editor in /schema", async () => {
    const { team } = await tree();
    const { client, fetch } = setup(cms);
    const res = await fetch(`${origin}/_tenon/collections/pages?path=/about/team`);
    expect((await res.json()).map((p: { id: string }) => p.id)).toEqual([team.id]);
    await client.signUp(admin);
    const schema = await client.request<any>("/schema");
    expect(schema.collections.pages.fields.seo.editor).toBe("seo");
  });
});

describe("nestedPaths", () => {
  it("works with other field names", async () => {
    const cms = defineCms({
      collections: {
        categories: {
          fields: {
            name: { type: "text", required: true },
            handle: { type: "slug", from: "name", parent: "parentCategory", path: "url" },
            parentCategory: { type: "relation", collection: "categories", onDelete: "restrict" },
            url: { type: "text", readOnly: true },
          },
          hooks: nestedPaths({ slug: "handle", parent: "parentCategory", path: "url" }),
        },
      },
      database: testDatabase(),
      secret: "x".repeat(32),
    });
    const shoes = await cms.create("categories", { name: "Shoes", handle: "" });
    const boots = await cms.create("categories", {
      name: "Boots",
      handle: "",
      parentCategory: shoes.id,
    });
    expect([shoes.url, boots.url]).toEqual(["/shoes", "/shoes/boots"]);
    await expect(cms.create("categories", { name: "Shoes", handle: "" })).rejects.toMatchObject({
      errors: { handle: expect.any(String) },
    });
    await expect(
      cms.update("categories", shoes.id, {
        name: "Shoes",
        handle: "shoes",
        parentCategory: boots.id,
      }),
    ).rejects.toMatchObject({
      errors: { parentCategory: expect.any(String) },
    });
    await cms.update("categories", shoes.id, { name: "Shoes", handle: "footwear" });
    expect((await cms.findById("categories", boots.id))?.url).toBe("/footwear/boots");
  });

  it("does not store values changed by read hooks when paths move", async () => {
    const cms = defineCms({
      collections: {
        pages: {
          fields: {
            ...page().fields,
            title: {
              type: "text",
              required: true,
              hooks: { afterRead: [({ value }) => `${value} *`] },
            },
          },
          hooks: page().hooks,
        },
      },
      database: testDatabase(),
      secret: "x".repeat(32),
    });
    const about = await cms.create("pages", { title: "About", slug: "about" });
    const team = await cms.create("pages", { title: "Team", slug: "team", parent: about.id });
    await cms.update("pages", about.id, { slug: "company" });
    expect(await cms.findById("pages", team.id)).toMatchObject({
      title: "Team *",
      path: "/company/team",
    });
  });
});

describe("strings preset", () => {
  const ui = strings({
    readMore: { label: "Read more link", default: { en: "Read more", de: "Weiterlesen" } },
    subscribe: "Subscribe",
  });
  const make = () =>
    defineCms({
      globals: { strings: ui },
      localization: { locales: ["en", "de"], defaultLocale: "en" },
      database: testDatabase(),
      secret: "x".repeat(32),
      media: false,
      settings: false,
    });

  it("is a localized global with a text field per key", () => {
    expect(ui.localized).toBe(true);
    expect(ui.fields.subscribe).toMatchObject({ type: "text", placeholder: "Subscribe" });
  });

  it("reads the code defaults of the locale, and prefers a stored value", async () => {
    const cms = make();
    expect(await cms.getGlobal("strings", { locale: "de", fallback: false })).toMatchObject({
      readMore: "Weiterlesen",
      subscribe: "Subscribe",
    });
    await cms.setGlobal("strings", { readMore: "Mehr lesen" }, { locale: "de" });
    const de = await cms.getGlobal("strings", { locale: "de", fallback: false });
    expect(de).toMatchObject({ readMore: "Mehr lesen", subscribe: "Subscribe" });
    expect(await cms.getGlobal("strings", { locale: "en" })).toMatchObject({
      readMore: "Read more",
    });
  });

  it("stores no code default, so a changed default reaches a saved locale", async () => {
    const { database } = testDb();
    const at = (subscribe: string) =>
      defineCms({
        globals: { strings: strings({ readMore: "Read more", subscribe }) },
        localization: { locales: ["en", "de"], defaultLocale: "en" },
        database,
        secret: "x".repeat(32),
        media: false,
        settings: false,
      });
    await at("Subscribe").setGlobal(
      "strings",
      { readMore: "Mehr lesen", subscribe: "Subscribe" },
      { locale: "de" },
    );
    expect(
      await at("Sign up").getGlobal("strings", { locale: "de", fallback: false }),
    ).toMatchObject({
      readMore: "Mehr lesen",
      subscribe: "Sign up",
    });
  });
});

describe("menu preset", () => {
  const { blocks, fields } = menu({ depth: -1 });
  const make = () =>
    defineCms({
      collections: {
        pages: {
          titleField: "title",
          permalink: "/{slug}",
          fields: { title: { type: "text" }, slug: { type: "slug" } },
        },
      },
      blocks: { ...blocks },
      globals: {
        mainMenu: { label: "Main menu", nav: { display: "settings" }, fields: { ...fields } },
      },
      database: testDatabase(),
      secret: "x".repeat(32),
      media: false,
    });

  it("nests links and headings and renders with menuItems()", async () => {
    const cms = make();
    const about = await cms.create("pages", { title: "About", slug: "about" });
    const shoes = await cms.create("pages", { title: "Shoes", slug: "shoes" });
    const link = (id: string) => ({ reference: { collection: "pages", id } });
    await cms.setGlobal("mainMenu", {
      items: [
        { blockType: "link", link: link(about.id) },
        {
          blockType: "heading",
          label: "Products",
          children: [
            {
              blockType: "link",
              label: "All shoes",
              link: link(shoes.id),
              children: [
                { blockType: "link", link: { href: "https://example.com", target: "_blank" } },
              ],
            },
          ],
        },
      ],
    });

    const items = menuItems((await cms.getGlobal("mainMenu")).items);

    expect(items).toMatchObject([
      { type: "link", label: "About", href: "/about", children: [] },
      {
        type: "heading",
        label: "Products",
        href: null,
        children: [
          {
            type: "link",
            label: "All shoes",
            href: "/shoes",
            children: [{ type: "link", label: "", href: "https://example.com", target: "_blank" }],
          },
        ],
      },
    ]);
    items[1].children[0].children[0].href satisfies string | null;
  });

  it("requires a link on a link item and a label on a heading", async () => {
    const cms = make();

    await expect(
      cms.setGlobal("mainMenu", {
        items: [{ blockType: "heading", children: [{ blockType: "link" }] }],
      }),
    ).rejects.toMatchObject({
      errors: {
        "items.0.label": expect.any(String),
        "items.0.children.0.link": expect.any(String),
      },
    });
  });

  it("takes blocks of the host wherever a link goes", async () => {
    const withButton = menu({
      depth: -1,
      blocks: {
        button: {
          fields: {
            label: { type: "text", required: true },
            link: { type: "link", required: true },
            style: { type: "select", options: ["primary", "secondary"] },
          },
        },
      },
    });
    const cms = defineCms({
      blocks: { ...withButton.blocks },
      globals: { mainMenu: { fields: { ...withButton.fields } } },
      database: testDatabase(),
      secret: "x".repeat(32),
      media: false,
    });
    const button = { label: "Shop", link: { href: "https://example.com" }, style: "primary" };
    await cms.setGlobal("mainMenu", {
      items: [
        { blockType: "button", ...button },
        {
          blockType: "link",
          link: { href: "/a" },
          children: [{ blockType: "button", ...button }],
        },
        { blockType: "heading", label: "More", children: [{ blockType: "button", ...button }] },
      ],
    });

    const items = menuItems((await cms.getGlobal("mainMenu")).items);

    expect(items).toMatchObject([
      { type: "button", label: "Shop", href: "https://example.com", style: "primary" },
      { type: "link", children: [{ type: "button", style: "primary" }] },
      { type: "heading", children: [{ type: "button", style: "primary" }] },
    ]);
  });

  describe("depth", () => {
    const build = (depth?: number) => {
      const preset = menu(depth === undefined ? {} : { depth });
      return defineCms({
        blocks: { ...preset.blocks },
        globals: { mainMenu: { fields: { ...preset.fields } } },
        database: testDatabase(),
        secret: "x".repeat(32),
        media: false,
      });
    };
    const link = (children?: unknown[]) => ({
      blockType: "link",
      link: { href: "/a" },
      ...(children && { children }),
    });

    // Unknown keys are stripped on write, so a level beyond `depth` is dropped, not rejected.
    const levels = (items: any[]): number =>
      items.length ? 1 + Math.max(...items.map((i) => levels(i.children ?? []))) : 0;
    const store = async (cms: ReturnType<typeof build>, items: unknown[]) =>
      levels(((await cms.setGlobal("mainMenu", { items })) as any).items);

    it("is flat by default, without headings or children", async () => {
      const cms = build();

      expect(await store(cms, [link(), link([link()])])).toBe(1);
      await expect(
        cms.setGlobal("mainMenu", { items: [{ blockType: "heading", label: "A" }] }),
      ).rejects.toBeDefined();
    });

    it("keeps exactly `depth` levels below the top", async () => {
      const cms = build(3);

      expect(await store(cms, [link([link([link([link([link()])])])])])).toBe(4);
    });

    it("lets a heading group links and count as a level", async () => {
      const cms = build(1);
      const heading = (children: unknown[]) => ({ blockType: "heading", label: "H", children });

      expect(await store(cms, [heading([link([link()])])])).toBe(2);
      await expect(
        cms.setGlobal("mainMenu", { items: [heading([heading([link()])])] }),
      ).rejects.toBeDefined();
    });

    it("needs no shared blocks unless unlimited", () => {
      expect(menu({ depth: 2 }).blocks).toEqual({});
      expect(menu({ depth: -1 }).blocks).toHaveProperty("menuLink");
    });
  });

  it("rejects a block named like a preset block", () => {
    // @ts-expect-error `link` is the preset's block
    menu({ blocks: { link: { fields: {} } } });
  });
});

describe("presets option", () => {
  const secret = "x".repeat(32);
  let upper: string[];
  const make = () =>
    defineCms({
      presets: [
        pagesPreset({
          seo: true,
          fields: { body: { type: "textarea" } },
          hooks: {
            beforeChange: {
              track: ({ data }) => {
                upper.push(data.title);
                return data;
              },
            },
          },
        }),
        stringsPreset({ readMore: "Read more" }),
        menuPreset({ name: "mainMenu", depth: -1 }),
        menuPreset({ name: "footerMenu", depth: -1 }),
      ],
      localization: { locales: ["en"], defaultLocale: "en" },
      database: testDatabase(),
      secret,
    });
  beforeEach(() => {
    upper = [];
  });

  it("adds the collections, globals and blocks of each preset", async () => {
    const cms = make();
    const about = await cms.create("pages", { title: "About", slug: "about", body: "Hi" });
    const team = await cms.create("pages", { title: "Team", slug: "team", parent: about.id });
    await cms.setGlobal("footerMenu", { items: [{ blockType: "link", link: { href: "/a" } }] });

    expect((await cms.findById("pages", team.id))?.path).toBe("/about/team");
    expect(upper).toEqual(["About", "Team"]);
    expect(cms.schema.collections?.pages.fields).toMatchObject({
      parent: { hidden: true },
      path: { hidden: true },
      seo: { type: "group" },
      body: { type: "textarea" },
    });
    expect((await cms.getGlobal("strings")).readMore).toBe("Read more");
    expect(menuItems((await cms.getGlobal("footerMenu")).items)).toMatchObject([{ href: "/a" }]);
    about.body satisfies string | null | undefined;
    // @ts-expect-error a preset name stays literal, so other names are type errors
    await cms.getGlobal("nope").catch(() => {});
  });

  describe("pagesPreset layout", () => {
    const build = (options: Parameters<typeof pagesPreset>[0] = {}) =>
      defineCms({ presets: [pagesPreset(options)], database: testDatabase(), secret }).schema
        .collections?.pages as unknown as Collection;

    it("adds a content blocks field only with `blocks`, and tabs only with `seo`", () => {
      expect(build().fields).not.toHaveProperty("content");
      expect(build().tabs).toBeUndefined();
      expect(build().fields.title.tab).toBeUndefined();
      expect(
        build({ blocks: { text: { fields: { body: { type: "textarea" } } } } }).fields.content,
      ).toMatchObject({
        type: "blocks",
        blocks: { text: { fields: { body: { type: "textarea" } } } },
      });
    });

    it("splits content and SEO into tabs with `seo: true`", () => {
      const pages = build({
        seo: true,
        blocks: { text: { fields: { body: { type: "textarea" } } } },
        fields: { summary: { type: "text" }, note: { type: "text", tab: "seo" } },
      });

      expect(pages.tabs).toHaveProperty("seo");
      expect(pages.fields.seo).toMatchObject({ appearance: "plain" });
      const tabs = Object.fromEntries(
        Object.entries(pages.fields ?? {}).map(([k, f]) => [k, f.tab]),
      );
      expect(tabs).toEqual({
        title: "content",
        slug: "content",
        parent: "content",
        path: "content",
        seo: "seo",
        content: "content",
        summary: "content",
        note: "seo",
      });
    });

    it("lets the host tabs merge over the preset's", () => {
      const pages = build({ seo: true, tabs: { seo: { label: "Search" }, extra: {} } });

      expect(pages.tabs).toMatchObject({ content: {}, seo: { label: "Search" }, extra: {} });
      expect(pages.fields.seo).toMatchObject({ appearance: "plain" });
    });

    it("reads `content` only when `blocks` is given", async () => {
      const withBlocks = defineCms({
        presets: [pagesPreset({ blocks: { text: { fields: { body: { type: "textarea" } } } } })],
        database: testDatabase(),
        secret,
      });
      const without = defineCms({
        presets: [pagesPreset()],
        database: testDatabase(),
        secret,
      });
      const a = await withBlocks.create("pages", { title: "A", slug: "a" });
      const b = await without.create("pages", { title: "B", slug: "b" });

      a.content satisfies unknown[] | null | undefined;
      // @ts-expect-error `content` exists only with `blocks`
      b.content;
    });
  });

  it("points `parent` at the preset's collection name", () => {
    const cms = defineCms({
      presets: [pagesPreset({ name: "docs" })],
      database: testDatabase(),
      secret,
    });

    expect(cms.schema.collections?.docs.fields.parent).toMatchObject({ collection: "docs" });
  });

  it("throws on a name the host or another preset uses", () => {
    expect(() =>
      defineCms({
        collections: { pages: { fields: {} } },
        presets: [pagesPreset()],
        database: testDatabase(),
        secret,
      }),
    ).toThrow('duplicate collection "pages"');
    expect(() =>
      defineCms({
        presets: [
          menuPreset({ depth: -1 }),
          menuPreset({ name: "other", depth: -1, blocks: { cta: { fields: {} } } }),
        ],
        database: testDatabase(),
        secret,
      }),
    ).toThrow('duplicate block "menuLink"');
  });
});
