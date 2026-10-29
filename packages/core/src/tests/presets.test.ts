import { beforeEach, describe, expect, it } from "vitest";
import { CmsError } from "../client/index.ts";
import { defineCms } from "../index.ts";
import { nestedPaths, page, seo, strings } from "../presets/index.ts";
import { admin, fresh, origin, setup, status, type Env, testDatabase, testDb } from "./setup.ts";

let cms: Env["cms"];
let client: Env["client"];
let fetchWithSession: Env["fetchWithSession"];
beforeEach(() => {
  ({ cms, client, fetchWithSession } = fresh());
});

describe("page preset", () => {
  // A test sets it to fail the update of the page with that slug.
  let failSlug: string | undefined;
  const make = () =>
    defineCms({
      collections: {
        pages: {
          titleField: "title",
          fields: { ...page.fields, ...seo.fields, body: { type: "textarea" } },
          hooks: {
            afterChange: page.hooks.afterChange,
            beforeChange: {
              ...page.hooks.beforeChange,
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
  let client: ReturnType<typeof setup<ReturnType<typeof make>>>["client"];
  let fetch: ReturnType<typeof setup>["fetch"];
  beforeEach(async () => {
    failSlug = undefined;
    ({ cms, client, fetch } = setup(make()));
    await client.signUp(admin);
  });
  const stored = async (id: string) => (await cms.findById("pages", id, { populate: false }))?.path;
  // Status and field keys of a 400 body.
  const fieldErrors = async (promise: Promise<unknown>) => {
    const e = await promise.then(
      () => undefined,
      (e: unknown) => e,
    );
    return e instanceof CmsError ? [e.status, Object.keys(e.body?.errors ?? {})] : e;
  };
  const tree = async () => {
    const about = await client.create("pages", { title: "About", slug: "about" });
    const team = await client.create("pages", { title: "Team", slug: "team", parent: about.id });
    const berlin = await client.create("pages", {
      title: "Berlin",
      slug: "berlin",
      parent: team.id,
    });
    return { about, team, berlin };
  };

  it("stores nested paths", async () => {
    const { about, team, berlin } = await tree();
    expect([await stored(about.id), await stored(team.id), await stored(berlin.id)]).toEqual([
      "/about",
      "/about/team",
      "/about/team/berlin",
    ]);
  });

  it("stores / for index at root", async () => {
    const home = await client.create("pages", { title: "Home", slug: "index" });
    expect(await stored(home.id)).toBe("/");
  });

  it("fills an empty slug from the title", async () => {
    const p = await client.create("pages", { title: "Über uns", slug: "" });
    expect(p).toMatchObject({ slug: "uber-uns", path: "/uber-uns" });
  });

  it("rejects an invalid slug", async () => {
    expect(await fieldErrors(client.create("pages", { title: "A", slug: "Not Valid" }))).toEqual([
      400,
      ["slug"],
    ]);
  });

  it("overwrites path in input", async () => {
    const a = await client.create("pages", { title: "A", slug: "a", path: "/x" });
    expect(await stored(a.id)).toBe("/a");
    await cms.update("pages", a.id, { title: "A", slug: "a", path: "/y" });
    expect(await stored(a.id)).toBe("/a");
  });

  it("rejects a duplicate path", async () => {
    const { about } = await tree();
    expect(await fieldErrors(client.create("pages", { title: "About", slug: "about" }))).toEqual([
      400,
      ["slug"],
    ]);
    const contact = await client.create("pages", { title: "Contact", slug: "contact" });
    await expect(
      client.create("pages", { title: "Team", slug: "team", parent: contact.id }),
    ).resolves.toBeDefined();
    expect(
      await fieldErrors(client.update("pages", contact.id, { title: "Contact", slug: "about" })),
    ).toEqual([400, ["slug"]]);
    await expect(
      client.update("pages", about.id, { title: "About", slug: "about" }),
    ).resolves.toBeDefined();
  });

  it("rejects moving a page under its own descendant", async () => {
    const { about, berlin } = await tree();
    expect(
      await fieldErrors(
        client.update("pages", about.id, { title: "About", slug: "about", parent: berlin.id }),
      ),
    ).toEqual([400, ["parent"]]);
    expect(
      await fieldErrors(
        client.update("pages", about.id, { title: "About", slug: "about", parent: about.id }),
      ),
    ).toEqual([400, ["parent"]]);
    expect((await cms.findById("pages", about.id, { populate: false }))?.parent).toBeUndefined();
  });

  it("rewrites descendant paths on rename", async () => {
    const { about, team, berlin } = await tree();
    await client.update("pages", about.id, { title: "About", slug: "company" });
    expect([await stored(about.id), await stored(team.id), await stored(berlin.id)]).toEqual([
      "/company",
      "/company/team",
      "/company/team/berlin",
    ]);
  });

  it("rolls back a rename when a descendant update fails", async () => {
    const { about, team, berlin } = await tree();
    failSlug = "berlin";
    expect(
      await status(client.update("pages", about.id, { title: "About", slug: "company" })),
    ).toBe(500);
    expect([await stored(about.id), await stored(team.id), await stored(berlin.id)]).toEqual([
      "/about",
      "/about/team",
      "/about/team/berlin",
    ]);
  });

  it("refuses to delete a page with children", async () => {
    const { about, team, berlin } = await tree();
    const error = await client.delete("pages", about.id).catch((e: unknown) => e);
    expect(error).toMatchObject({
      status: 409,
      body: { references: [{ collection: "pages", id: team.id }] },
    });
    await client.delete("pages", berlin.id);
    expect(await cms.findById("pages", berlin.id)).toBeUndefined();
  });

  it("disables a hook omitted by name", async () => {
    const { uniquePath, ...beforeChange } = page.hooks.beforeChange;
    const cms = defineCms({
      collections: { pages: { fields: page.fields, hooks: { beforeChange } } },
      database: testDatabase(),
      secret: "x".repeat(32),
    });
    await cms.create("pages", { title: "About", slug: "about" });
    await expect(cms.create("pages", { title: "About", slug: "about" })).resolves.toMatchObject({
      path: "/about",
    });
  });

  it("stores seo as sent", async () => {
    const p = await client.create("pages", {
      title: "About",
      slug: "about",
      seo: { description: "D" },
    });
    expect((await cms.findById("pages", p.id))?.seo).toEqual({ description: "D" });
  });

  it("reads a page by path over HTTP", async () => {
    const { team } = await tree();
    const res = await fetch(`${origin}/api/cms/collections/pages?path=/about/team`);
    expect((await res.json()).map((p: { id: string }) => p.id)).toEqual([team.id]);
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
            ...page.fields,
            title: {
              type: "text",
              required: true,
              hooks: { afterRead: [({ value }) => `${value} *`] },
            },
          },
          hooks: page.hooks,
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

  it("is a localized settings global with a text field per key", () => {
    expect(ui.localized).toBe(true);
    expect(ui.nav).toMatchObject({ display: "settings" });
    expect(ui.fields.readMore).toMatchObject({
      type: "text",
      label: "Read more link",
      placeholder: "Read more",
    });
    expect(ui.fields.subscribe).toMatchObject({
      type: "text",
      label: "subscribe",
      placeholder: "Subscribe",
    });
  });

  it("reads the code defaults of the locale before anything is saved", async () => {
    const cms = make();
    expect(await cms.getGlobal("strings", { locale: "de", fallback: false })).toMatchObject({
      readMore: "Weiterlesen",
      subscribe: "Subscribe",
    });
    expect(await cms.getGlobal("strings", { locale: "en" })).toMatchObject({
      readMore: "Read more",
      subscribe: "Subscribe",
    });
  });

  it("prefers a stored value", async () => {
    const cms = make();
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
