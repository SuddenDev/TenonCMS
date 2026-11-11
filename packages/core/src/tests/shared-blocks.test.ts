import { describe, expect, expectTypeOf, it } from "vitest";
import type { BlockOf } from "../client/index.ts";
import { type Block, ConflictError, defineCms, defineCollection } from "../index.ts";
import { admin, setup, testDatabase } from "./setup.ts";

const options = { database: testDatabase, secret: "x".repeat(32), media: false } as const;

const hero = { fields: { heading: { type: "text" } } } as const satisfies Block;

const make = () =>
  defineCms({
    database: options.database(),
    secret: options.secret,
    media: false,
    blocks: {
      text: { fields: { body: { type: "text", required: true } } },
      section: {
        fields: {
          title: { type: "text", default: "Untitled" },
          link: { type: "relation", collection: "posts" },
          owner: { type: "relation", collection: "authors", required: true },
          children: { type: "blocks", blocks: ["section", "text"] },
        },
      },
    },
    collections: {
      posts: { fields: {} },
      authors: { fields: {} },
      pages: {
        fields: {
          content: {
            type: "blocks",
            blocks: {
              hero,
              section: "section",
              note: "text",
            },
          },
        },
      },
    },
  });

describe("shared blocks", () => {
  it("nest a block in itself, with defaults and ids at every level", async () => {
    const cms = make();
    const author = await cms.create("authors", {});
    const page = await cms.create("pages", {
      content: [
        { blockType: "hero", heading: "Hi" },
        {
          blockType: "section",
          owner: author.id,
          children: [
            {
              blockType: "section",
              owner: author.id,
              children: [{ blockType: "text", body: "deep" }],
            },
          ],
        },
        { blockType: "note", body: "aliased" },
      ],
    });

    const section = page.content![1];
    expect(section).toMatchObject({
      id: expect.any(String),
      title: "Untitled",
      children: [
        {
          id: expect.any(String),
          title: "Untitled",
          children: [{ id: expect.any(String), blockType: "text", body: "deep" }],
        },
      ],
    });
    expect(page.content![2]).toMatchObject({ blockType: "note", body: "aliased" });

    if (section.blockType === "section") {
      // @ts-expect-error `body` is not a field of a section.
      void section.body;
      const inner = section.children![0];
      if (inner.blockType === "section") {
        expectTypeOf(inner.title).toEqualTypeOf<string | null | undefined>();
        const text = inner.children![0];
        if (text.blockType === "text") expectTypeOf(text.body).toEqualTypeOf<string>();
      }
    }
    const note = page.content![2];
    if (note.blockType === "note") expectTypeOf(note.body).toEqualTypeOf<string>();
  });

  it("type items in the client and are sent by name in /schema", async () => {
    const { client } = setup(make());
    await client.signUp(admin);
    const page = await client.create("pages", { content: [{ blockType: "hero", heading: "Hi" }] });
    const item = page.content![0];
    if (item.blockType === "section") {
      const inner = item.children![0];
      if (inner.blockType === "section") expectTypeOf(inner.owner).toEqualTypeOf<string>();
    }
    expectTypeOf<BlockOf<typeof page.content>["blockType"]>().toEqualTypeOf<
      "hero" | "section" | "note"
    >();
    expectTypeOf<BlockOf<typeof page.content, "note">["body"]>().toEqualTypeOf<string>();
    expect(item).toMatchObject({ blockType: "hero", heading: "Hi" });

    const schema = (await client.getSchema()) as any;
    expect(schema.collections.pages.fields.content.blocks).toMatchObject({
      hero: { fields: { heading: { type: "text" } } },
      section: "section",
      note: "text",
    });
    expect(schema.blocks.section.fields.children.blocks).toEqual({
      section: "section",
      text: "text",
    });
  });

  it("validates at the positional path of a nested item", async () => {
    const cms = make();
    const author = await cms.create("authors", {});
    await expect(
      cms.create("pages", {
        content: [
          {
            blockType: "section",
            owner: author.id,
            children: [
              { blockType: "section", owner: author.id, children: [{ blockType: "text" }] },
            ],
          } as never,
        ],
      }),
    ).rejects.toMatchObject({
      errors: { "content.0.children.0.children.0.body": expect.any(String) },
    });
    await expect(
      cms.create("pages", {
        content: [
          {
            blockType: "section",
            owner: author.id,
            children: [{ blockType: "section", owner: author.id, link: "nope" }],
          },
        ],
      }),
    ).rejects.toMatchObject({ errors: { "content.0.children.0.link": 'Unknown id in "posts"' } });
  });

  it("populate and apply onDelete at any depth", async () => {
    const cms = make();
    const author = await cms.create("authors", {});
    const post = await cms.create("posts", {});
    const deep = { blockType: "section", owner: author.id, link: post.id } as const;
    const page = await cms.create("pages", {
      content: [{ blockType: "section", owner: author.id, children: [deep] }],
    });
    const read = await cms.findById("pages", page.id, { depth: 1 });
    expect(read!.content![0]).toMatchObject({ children: [{ link: { id: post.id } }] });

    await cms.delete("posts", post.id);
    const [section] = (await cms.findById("pages", page.id, { populate: false }))!.content!;
    expect(section).toMatchObject({ children: [{ link: null }] });

    await expect(cms.delete("authors", author.id)).rejects.toBeInstanceOf(ConflictError);
  });

  it("apply onDelete in locale rows and their drafts", async () => {
    const cms = defineCms({
      ...options,
      database: options.database(),
      localization: { locales: ["en", "de"], defaultLocale: "en" },
      blocks: {
        section: {
          fields: {
            link: { type: "relation", collection: "posts" },
            children: { type: "blocks", blocks: { section: "section" } },
          },
        },
      },
      collections: {
        posts: { fields: {} },
        pages: {
          localized: true,
          fields: { content: { type: "blocks", blocks: { section: "section" } } },
        },
      },
    });
    const post = await cms.create("posts", {});
    const content = [
      { blockType: "section", children: [{ blockType: "section", link: post.id }] },
    ] as const;
    const page = await cms.create("pages", { content: [...content] }, { locale: "de" });
    await cms.update("pages", page.id, { content: [...content] }, { locale: "de", draft: true });
    const draft = await cms
      .withDrafts()
      .findById("pages", page.id, { locale: "de", populate: false });
    expect(draft!.content![0]).toMatchObject({ children: [{ link: post.id }] });

    await cms.delete("posts", post.id);
    for (const read of [cms, cms.withDrafts()]) {
      const doc = await read.findById("pages", page.id, { locale: "de", populate: false });
      expect(doc!.content![0]).toMatchObject({ children: [{ link: null }] });
    }
  });

  it("reject an unknown name at the type level", () => {
    const blocks = { text: { fields: {} } } as const;
    const listed = defineCollection({
      fields: { c: { type: "blocks", blocks: ["text", "nope"] } },
    });
    const keyed = defineCollection({ fields: { c: { type: "blocks", blocks: { a: "nope" } } } });
    const inline = defineCollection({
      fields: {
        c: {
          type: "blocks",
          blocks: { a: { fields: { d: { type: "blocks", blocks: ["nope"] } } } },
        },
      },
    });
    const good = defineCollection({ fields: { c: { type: "blocks", blocks: ["text"] } } });
    () => {
      defineCms({ ...options, database: options.database(), blocks, collections: { good } });
      // @ts-expect-error a list names an unknown shared block
      defineCms({ ...options, database: options.database(), blocks, collections: { listed } });
      // @ts-expect-error a key names an unknown shared block
      defineCms({ ...options, database: options.database(), blocks, collections: { keyed } });
      // @ts-expect-error an inline block names an unknown shared block
      defineCms({ ...options, database: options.database(), blocks, collections: { inline } });
      // @ts-expect-error a global names an unknown shared block
      defineCms({ ...options, database: options.database(), blocks, globals: { keyed } });
      defineCms({
        ...options,
        database: options.database(),
        blocks: {
          // @ts-expect-error a shared block names an unknown shared block
          section: { fields: { c: { type: "blocks", blocks: ["section", "nope"] } } },
        },
      });
    };
  });

  it("throw at startup for an unknown name", () => {
    expect(() =>
      defineCms({
        ...options,
        database: options.database(),
        collections: {
          pages: { fields: { content: { type: "blocks", blocks: { a: "nope" as never } } } },
        },
      }),
    ).toThrow('blocks "pages.content.a" names an unknown shared block "nope"');
  });
});
