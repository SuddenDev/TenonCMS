import { describe, expect, expectTypeOf, it } from "vitest";
import { defineCms } from "../index.ts";
import { origin, seeded, setup, testDatabase } from "./setup.ts";

const site = (extra: object = {}) =>
  defineCms({
    collections: {
      posts: {
        permalink: "/posts/{slug}",
        fields: {
          title: { type: "text", required: true },
          slug: { type: "text" },
          seo: { type: "group", fields: { noindex: { type: "boolean" } } },
        },
      },
      notes: { fields: { text: { type: "text" } } },
    },
    database: testDatabase(),
    secret: "x".repeat(32),
    media: false,
    ...extra,
  });

describe("permalink read option", () => {
  it("adds the public URL of each document", async () => {
    const cms = site();
    const a = await cms.create("posts", { title: "A", slug: "a" });
    await cms.create("posts", { title: "B", slug: "b" });

    const docs = await cms.find("posts", { permalink: true });
    expect(docs.map((d) => d.permalink)).toEqual(["/posts/b", "/posts/a"]);
    expect((await cms.findById("posts", a.id, { permalink: true }))?.permalink).toBe("/posts/a");
    expectTypeOf(docs[0]!.permalink).toEqualTypeOf<string | null>();
  });

  it("is null without a permalink or a value to fill it", async () => {
    const cms = site();
    await cms.create("notes", { text: "N" });
    await cms.create("posts", { title: "No slug" });

    expect((await cms.find("notes", { permalink: true }))[0]).toHaveProperty("permalink", null);
    expect((await cms.find("posts", { permalink: true }))[0]).toHaveProperty("permalink", null);
  });

  it("is left out without the option", async () => {
    const cms = site();
    await cms.create("posts", { title: "A", slug: "a" });
    const [doc] = await cms.find("posts");
    expect(doc).not.toHaveProperty("permalink");
    // @ts-expect-error Only typed with the option.
    doc!.permalink;
  });

  it("follows select", async () => {
    const cms = site();
    const a = await cms.create("posts", { title: "A", slug: "a" });

    expect(await cms.findById("posts", a.id, { permalink: true, select: { title: true } })).toEqual(
      { id: a.id, title: "A" },
    );
    expect(
      await cms.findById("posts", a.id, { permalink: true, select: { permalink: true } }),
    ).toEqual({ id: a.id, permalink: "/posts/a" });
  });

  it("works over HTTP", async () => {
    const { cms, client, fetch } = setup(site());
    await cms.create("posts", { title: "A", slug: "a" });

    expect((await client.find("posts", { permalink: true }))[0]?.permalink).toBe("/posts/a");
    const res = await fetch(`${origin}/_tenon/collections/posts?permalink=nope`);
    expect(res.status).toBe(400);
  });

  it("uses the read's locale and its prefix", async () => {
    const s = seeded({ collections: { posts: { permalink: "/posts/{slug}" } } });
    await s.doc(
      "p1",
      { data: {} },
      {
        en: { data: { title: "Hello", slug: "hello" } },
        de: { data: { title: "Hallo", slug: "hallo" } },
      },
    );

    expect((await s.cms.findById("posts", "p1", { permalink: true }))?.permalink).toBe(
      "/posts/hello",
    );
    expect(
      (await s.cms.findById("posts", "p1", { permalink: true, locale: "de" }))?.permalink,
    ).toBe("/de/posts/hallo");
  });
});

const get = async (cms: { fetch(r: Request): Promise<Response> }, path: string) => {
  const res = await cms.fetch(new Request(`${origin}${path}`));
  return { status: res.status, type: res.headers.get("content-type"), text: await res.text() };
};
const locs = (xml: string) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

describe("sitemap.xml", () => {
  it("lists the published documents of collections with a permalink", async () => {
    const cms = site();
    await cms.create("posts", { title: "A", slug: "a" });
    await cms.create("posts", { title: "Draft", slug: "draft" }, { draft: true });
    await cms.create("posts", { title: "Hidden", slug: "hidden", seo: { noindex: true } });
    await cms.create("notes", { text: "No permalink" });

    const res = await get(cms, "/sitemap.xml");
    expect(res.status).toBe(200);
    expect(res.type).toContain("application/xml");
    expect(locs(res.text)).toEqual([`${origin}/posts/a`]);
    expect(res.text).toMatch(/<lastmod>\d{4}-\d\d-\d\dT/);
  });

  it("uses the site URL from the general settings, then `site`", async () => {
    const cms = site({ site: "https://site.example" });
    await cms.create("posts", { title: "A", slug: "a" });
    expect(locs((await get(cms, "/sitemap.xml")).text)).toEqual(["https://site.example/posts/a"]);

    await cms.setGlobal("general", { title: "Acme", url: "https://acme.example/" });
    expect(locs((await get(cms, "/sitemap.xml")).text)).toEqual(["https://acme.example/posts/a"]);
  });

  it("leaves out collections with `sitemap: false` and ones visitors cannot read", async () => {
    const cms = site({
      collections: {
        posts: { permalink: "/posts/{slug}", sitemap: false, fields: { slug: { type: "text" } } },
        team: {
          permalink: "/team/{slug}",
          access: { read: ({ user }: { user: unknown }) => !!user },
          fields: { slug: { type: "text" } },
        },
      },
    });
    await cms.create("posts", { slug: "a" });
    await cms.create("team" as never, { slug: "ann" } as never);
    expect(locs((await get(cms, "/sitemap.xml")).text)).toEqual([]);
  });

  it("merges the host's entries", async () => {
    const cms = site({
      sitemap: {
        entries: ({ entries }: { entries: { url: string }[] }) => [
          ...entries.filter((e) => !e.url.endsWith("/b")),
          { url: "/contact" },
          { url: "https://other.example/x" },
        ],
      },
    });
    await cms.create("posts", { title: "A", slug: "a" });
    await cms.create("posts", { title: "B", slug: "b" });

    expect(locs((await get(cms, "/sitemap.xml")).text)).toEqual([
      `${origin}/posts/a`,
      `${origin}/contact`,
      "https://other.example/x",
    ]);
    expect((await cms.sitemap()).map((e) => e.url)).toEqual([
      "/posts/a",
      "/contact",
      "https://other.example/x",
    ]);
  });

  it("lists each locale with its alternates", async () => {
    const s = seeded({ collections: { posts: { permalink: "/posts/{slug}" } } });
    await s.doc(
      "p1",
      { data: {} },
      {
        en: { data: { title: "Hello", slug: "hello" } },
        de: { data: { title: "Hallo", slug: "hallo" } },
      },
    );
    await s.doc(
      "p2",
      { data: {} },
      {
        en: { data: { title: "Two", slug: "two" } },
        de: { data: {}, draft: { title: "Zwei", slug: "zwei" }, published: false },
      },
    );

    const { text } = await get(s.cms, "/sitemap.xml");
    expect(locs(text)).toEqual([
      `${origin}/posts/two`,
      `${origin}/posts/hello`,
      `${origin}/de/posts/hallo`,
    ]);
    expect(text).toContain(
      `<xhtml:link rel="alternate" hreflang="de" href="${origin}/de/posts/hallo"/>` +
        `<xhtml:link rel="alternate" hreflang="x-default" href="${origin}/posts/hello"/>`,
    );
  });

  it("is empty when the site is noindex", async () => {
    const cms = site();
    await cms.create("posts", { title: "A", slug: "a" });
    await cms.setGlobal("seo", { noindex: true });
    expect(locs((await get(cms, "/sitemap.xml")).text)).toEqual([]);
  });

  it("is off with `sitemap: false`", async () => {
    const cms = site({ sitemap: false });
    expect((await get(cms, "/sitemap.xml")).status).toBe(404);
    expect(await cms.sitemap()).toEqual([]);
  });
});

describe("robots.txt", () => {
  it("allows the site and points to the sitemap", async () => {
    const res = await get(site(), "/robots.txt");
    expect(res.status).toBe(200);
    expect(res.type).toContain("text/plain");
    expect(res.text).toBe(
      [
        "User-agent: *",
        "Allow: /",
        "Allow: /_tenon/media/",
        "Disallow: /_tenon/",
        "",
        `Sitemap: ${origin}/sitemap.xml`,
        "",
      ].join("\n"),
    );
  });

  it("disallows everything when the site is noindex", async () => {
    const cms = site();
    await cms.setGlobal("seo", { noindex: true });
    expect((await get(cms, "/robots.txt")).text).toBe(
      `User-agent: *\nDisallow: /\n\nSitemap: ${origin}/sitemap.xml\n`,
    );
  });

  it("takes the host's rules, and drops the sitemap line without a sitemap", async () => {
    const cms = site({
      sitemap: false,
      robots: {
        rules: ({ rules }: { rules: object[] }) => [
          ...rules,
          { userAgent: "GPTBot", disallow: ["/"] },
        ],
      },
    });
    const { text } = await get(cms, "/robots.txt");
    expect(text).toContain("\n\nUser-agent: GPTBot\nDisallow: /\n");
    expect(text).not.toContain("Sitemap:");
  });

  it("is off with `robots: false`", async () => {
    expect((await get(site({ robots: false }), "/robots.txt")).status).toBe(404);
  });
});
