import { beforeEach, describe, expect, it } from "vitest";
import { defineCms } from "../index.ts";
import { admin, localized, setup, testDatabase } from "./setup.ts";

let calls: unknown[];
beforeEach(() => {
  calls = [];
});

const make = () =>
  defineCms({
    collections: {
      menus: {
        fields: {
          title: { type: "text" },
          links: {
            type: "array",
            maxRows: 3,
            fields: {
              label: {
                type: "text",
                required: true,
                validate: (value) => value !== "bad" || "Not allowed",
                hooks: {
                  beforeChange: [
                    ({ value, path, siblingData }) => {
                      calls.push(["beforeChange", path, siblingData.id]);
                      return typeof value === "string" ? value.trim() : value;
                    },
                  ],
                  afterRead: [({ path }) => void calls.push(["afterRead", path])],
                },
              },
              target: { type: "select", options: ["self", "blank"], default: "self" },
              slug: { type: "slug", from: "label" },
            },
          },
        },
      },
      lists: {
        fields: {
          tags: {
            type: "array",
            required: true,
            minRows: 2,
            fields: { name: { type: "text" } },
          },
        },
      },
    },
    database: testDatabase(),
    secret: "x".repeat(32),
    media: false,
  });

async function signedIn() {
  const s = setup(make());
  await s.client.signUp(admin);
  return s;
}

const errorOf = (p: Promise<unknown>) =>
  p.then(
    () => undefined,
    (e: unknown) => e,
  );

describe("array ids", () => {
  it("fills missing ids and keeps a given one", async () => {
    const { client } = await signedIn();
    const doc = await client.create("menus", {
      links: [{ label: "Docs" }, { id: "keep", label: "Blog" }],
    });
    expect(doc.links).toEqual([
      expect.objectContaining({ id: expect.any(String), label: "Docs" }),
      expect.objectContaining({ id: "keep", label: "Blog" }),
    ]);
    expect(doc.links![0].id).not.toBe("");
  });

  it("keeps the ids an update sends", async () => {
    const { client } = await signedIn();
    const doc = await client.create("menus", { links: [{ label: "A" }, { label: "B" }] });
    const [a, b] = doc.links!;
    const next = await client.update("menus", doc.id, {
      links: [
        { ...b, label: "B2" },
        { ...a, label: "A2" },
      ],
    });
    expect(next.links!.map((l) => [l.id, l.label])).toEqual([
      [b.id, "B2"],
      [a.id, "A2"],
    ]);
    expect((await client.findById("menus", doc.id))!.links).toEqual(next.links);
  });

  it("rejects a duplicate id at the list's path", async () => {
    const { client } = await signedIn();
    const error = await errorOf(
      client.create("menus", {
        links: [
          { id: "x", label: "A" },
          { id: "x", label: "B" },
        ],
      }),
    );
    expect(error).toMatchObject({ status: 400, body: { errors: { links: "Duplicate id" } } });
  });
});

describe("array validation", () => {
  it("answers 400 with the positional path of an invalid item value", async () => {
    const { client } = await signedIn();
    const error = await errorOf(
      client.create("menus", { links: [{ label: "A" }, { label: 5 }] } as never),
    );
    expect(error).toMatchObject({
      status: 400,
      body: { errors: { "links.1.label": expect.any(String) } },
    });
  });

  it("checks required, minRows and maxRows", async () => {
    const { client } = await signedIn();
    expect(await errorOf(client.create("lists", {} as never))).toMatchObject({
      status: 400,
      body: { errors: { tags: expect.any(String) } },
    });
    expect(await errorOf(client.create("lists", { tags: [] }))).toMatchObject({
      status: 400,
      body: { errors: { tags: "At least 2 items" } },
    });
    expect(await errorOf(client.create("lists", { tags: [{ name: "a" }] } as never))).toMatchObject(
      {
        status: 400,
        body: { errors: { tags: "At least 2 items" } },
      },
    );
    await expect(
      client.create("lists", { tags: [{ name: "a" }, { name: "b" }] }),
    ).resolves.toMatchObject({ tags: [{ name: "a" }, { name: "b" }] });
    const four = [{ label: "a" }, { label: "b" }, { label: "c" }, { label: "d" }];
    expect(await errorOf(client.create("menus", { links: four } as never))).toMatchObject({
      status: 400,
      body: { errors: { links: "At most 3 items" } },
    });
  });

  it("reports a custom validate message at the positional path", async () => {
    const { client } = await signedIn();
    const error = await errorOf(
      client.create("menus", { links: [{ label: "ok" }, { label: "bad" }] } as never),
    );
    expect(error).toMatchObject({
      status: 400,
      body: { errors: { "links.1.label": "Not allowed" } },
    });
  });
});

describe("array runtime", () => {
  it("applies item defaults on create, not on update", async () => {
    const cms = make();
    const doc = await cms.create("menus", {
      links: [{ label: "A" }, { label: "B", target: "blank" }],
    });
    expect(doc.links!.map((l) => l.target)).toEqual(["self", "blank"]);
    const next = await cms.update("menus", doc.id, {
      links: [...doc.links!, { label: "C" }],
    });
    expect(next!.links![2]).not.toHaveProperty("target");
  });

  it("runs field hooks inside items with the positional path", async () => {
    const cms = make();
    const doc = await cms.create("menus", { links: [{ label: " A " }, { label: "B" }] });
    expect(doc.links!.map((l) => l.label)).toEqual(["A", "B"]);
    expect(calls).toContainEqual(["beforeChange", "links.0.label", doc.links![0].id]);
    expect(calls).toContainEqual(["beforeChange", "links.1.label", doc.links![1].id]);
    expect(calls).toContainEqual(["afterRead", "links.1.label"]);
  });

  it("fills a slug from its sibling inside an item", async () => {
    const cms = make();
    const doc = await cms.create("menus", {
      links: [{ label: "Hello World" }, { label: "Keep", slug: "own" }],
    });
    expect(doc.links!.map((l) => l.slug)).toEqual(["hello-world", "own"]);
  });
});

describe("array drafts", () => {
  it("accepts an incomplete item in a draft, fills its id, and fails on publish", async () => {
    const cms = make();
    const draft = await cms.create("menus", { links: [{ target: "blank" }] }, { draft: true });
    expect(draft.links).toEqual([expect.objectContaining({ id: expect.any(String) })]);
    await expect(cms.publish("menus", draft.id)).rejects.toMatchObject({
      errors: { "links.0.label": expect.any(String) },
    });
  });
});

describe("array in a localized entry", () => {
  const make = () =>
    localized({
      collections: {
        menus: {
          localized: true,
          fields: {
            links: { type: "array", fields: { label: { type: "text" } } },
            shared: { type: "array", localized: false, fields: { label: { type: "text" } } },
          },
        },
      },
    });
  const de = { locale: "de" } as never;

  it("keeps a list per locale and shares an unlocalized one", async () => {
    const cms = make().cms as any;
    const doc = await cms.create("menus", {
      links: [{ label: "Home" }],
      shared: [{ label: "x" }],
    } as never);
    await cms.update(
      "menus",
      doc.id,
      { links: [{ label: "Start" }, { label: "Blog" }] } as never,
      de,
    );
    await cms.update("menus", doc.id, { shared: [{ label: "y" }] } as never, de);

    const en = (await cms.findById("menus", doc.id)) as any;
    const ger = (await cms.findById("menus", doc.id, de)) as any;
    expect(en.links.map((l: any) => l.label)).toEqual(["Home"]);
    expect(ger.links.map((l: any) => l.label)).toEqual(["Start", "Blog"]);
    expect(en.shared).toEqual([{ id: expect.any(String), label: "y" }]);
    expect(ger.shared).toEqual(en.shared);
  });
});

describe("blocks", () => {
  const make = () =>
    defineCms({
      collections: {
        pages: {
          fields: {
            content: {
              type: "blocks",
              maxRows: 3,
              blocks: {
                hero: {
                  fields: {
                    title: {
                      type: "text",
                      required: true,
                      hooks: {
                        beforeChange: [
                          ({ value, path }) => {
                            calls.push(["beforeChange", path]);
                            return typeof value === "string" ? value.trim() : value;
                          },
                        ],
                      },
                    },
                    align: { type: "select", options: ["left", "center"], default: "left" },
                  },
                },
                text: { fields: { body: { type: "text", required: true } } },
              },
            },
          },
        },
        stacks: {
          fields: {
            items: {
              type: "blocks",
              required: true,
              minRows: 2,
              blocks: { a: { fields: { n: { type: "number" } } } },
            },
          },
        },
      },
      database: testDatabase(),
      secret: "x".repeat(32),
      media: false,
    });
  const signedIn = async () => {
    const s = setup(make());
    await s.client.signUp(admin);
    return s;
  };

  it("fills ids, keeps blockType and narrows on it", async () => {
    const { client } = await signedIn();
    const doc = await client.create("pages", {
      content: [
        { blockType: "hero", title: "Hi" },
        { id: "t", blockType: "text", body: "B" },
      ],
    });
    expect(doc.content).toEqual([
      { id: expect.any(String), blockType: "hero", title: "Hi", align: "left" },
      { id: "t", blockType: "text", body: "B" },
    ]);
    const hero = doc.content!.find((b) => b.blockType === "hero");
    if (hero?.blockType === "hero") expect(hero.title).toBe("Hi");
  });

  it("answers 400 for an unknown block, an invalid item value and duplicate ids", async () => {
    const { client } = await signedIn();
    const create = (content: unknown) => errorOf(client.create("pages", { content } as never));
    expect(await create([{ blockType: "hero", title: "a" }, { blockType: "nope" }])).toMatchObject({
      status: 400,
      body: { errors: { "content.1.blockType": "Unknown block" } },
    });
    expect(await create([{ blockType: "text", body: "a" }, { blockType: "hero" }])).toMatchObject({
      status: 400,
      body: { errors: { "content.1.title": expect.any(String) } },
    });
    const twice = { id: "x", blockType: "text", body: "a" };
    expect(await create([twice, twice])).toMatchObject({
      body: { errors: { content: "Duplicate id" } },
    });
  });

  it("checks required, minRows and maxRows", async () => {
    const { client } = await signedIn();
    const a = { blockType: "a" };
    expect(await errorOf(client.create("stacks", {} as never))).toMatchObject({
      body: { errors: { items: expect.any(String) } },
    });
    expect(await errorOf(client.create("stacks", { items: [a] } as never))).toMatchObject({
      body: { errors: { items: "At least 2 items" } },
    });
    await expect(client.create("stacks", { items: [a, a] } as never)).resolves.toBeTruthy();
    const hero = { blockType: "hero", title: "x" };
    expect(
      await errorOf(client.create("pages", { content: [hero, hero, hero, hero] } as never)),
    ).toMatchObject({ body: { errors: { content: "At most 3 items" } } });
  });

  it("applies defaults and field hooks of the item's block", async () => {
    const cms = make();
    const doc = await cms.create("pages", {
      content: [
        { blockType: "text", body: "b" },
        { blockType: "hero", title: " T " },
      ],
    });
    expect(doc.content![1]).toMatchObject({ title: "T", align: "left" });
    expect(doc.content![0]).not.toHaveProperty("align");
    expect(calls).toEqual([["beforeChange", "content.1.title"]]);
  });

  it("accepts an incomplete block in a draft and fails on publish", async () => {
    const cms = make();
    const draft = await cms.create("pages", { content: [{ blockType: "text" }] }, { draft: true });
    expect(draft.content).toEqual([{ id: expect.any(String), blockType: "text" }]);
    await expect(cms.publish("pages", draft.id)).rejects.toMatchObject({
      errors: { "content.0.body": expect.any(String) },
    });
  });
});
