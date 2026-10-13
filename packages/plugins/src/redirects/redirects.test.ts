import { describe, expect, it } from "vitest";
import { createClient } from "integral-cms/client";
import { defineCms, defineCollection } from "integral-cms";
import { page } from "integral-cms/presets";
import { RedirectsPlugin, resolveRedirect } from "./index.ts";

const origin = "http://localhost";
const admin = { name: "Admin", email: "a@b.co", password: "password123" };

function make(localizedPages = false, collections = ["pages"], locales?: string[]) {
  const cms = defineCms({
    localization: { locales: ["en", "de"], defaultLocale: "en" },
    collections: {
      pages: defineCollection({
        fields: page.fields,
        hooks: page.hooks,
        localized: localizedPages,
      }),
      posts: defineCollection({ fields: { title: { type: "text" }, path: { type: "text" } } }),
    },
    plugins: [RedirectsPlugin({ collections, locales })],
    database: { url: ":memory:" },
    secret: "x".repeat(32),
  });
  let cookie = "";
  const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    headers.set("origin", origin);
    if (cookie) headers.set("cookie", cookie);
    const res = await cms.fetch(new Request(input, { ...init, headers }));
    const set = res.headers.getSetCookie().map((c) => c.split(";")[0]);
    if (set.length) cookie = set.join("; ");
    return res;
  };
  return { cms, client: createClient<typeof cms>({ baseUrl: origin, fetch }) };
}

describe("redirects", () => {
  it("adds a redirect when a page's path changes and keeps it one hop", async () => {
    const { cms } = make();
    const about = await cms.create("pages", { title: "About", slug: "about" });
    await cms.update("pages", about.id, { slug: "about-us" });
    expect(await resolveRedirect(cms, "/about")).toEqual({ to: "/about-us", status: 301 });
    // A child moves with its parent. Its old path redirects too.
    const team = await cms.create("pages", { title: "Team", slug: "team", parent: about.id });
    await cms.update("pages", about.id, { slug: "company" });
    expect(await resolveRedirect(cms, "/about-us/team")).toEqual({
      to: "/company/team",
      status: 301,
    });
    // The first redirect now points at the newest path, not at the intermediate one.
    expect(await resolveRedirect(cms, "/about")).toEqual({ to: "/company", status: 301 });
    // Moving back removes the redirect that would loop.
    await cms.update("pages", about.id, { slug: "about" });
    expect(await resolveRedirect(cms, "/about")).toBeUndefined();
    expect(await resolveRedirect(cms, "/company")).toEqual({ to: "/about", status: 301 });
    expect(await resolveRedirect(cms, "/nope")).toBeUndefined();
    expect(team.id).toBeTruthy();
  });

  it("ignores collections that are not listed", async () => {
    const { cms } = make();
    const post = await cms.create("posts", { title: "a", path: "/a" });
    await cms.update("posts", post.id, { path: "/b" });
    expect(await cms.find("redirects")).toEqual([]);
  });

  it("validates redirects", async () => {
    const { cms } = make();
    await expect(cms.create("redirects", { from: "old", to: "/new" })).rejects.toMatchObject({
      errors: { from: expect.any(String) },
    });
    // `to` lands in `href` and `Location`, so only paths and http(s) URLs are allowed.
    await expect(
      cms.create("redirects", { from: "/old", to: "javascript:alert(1)" }),
    ).rejects.toMatchObject({ errors: { to: expect.any(String) } });
    await cms.create("redirects", { from: "/ext", to: "https://example.com/x" });
    await cms.create("redirects", { from: "/old", to: "/new" });
    await expect(cms.create("redirects", { from: "/old", to: "/other" })).rejects.toMatchObject({
      errors: { from: "Already used" },
    });
  });

  it("serves a public lookup and a private import", async () => {
    const { cms, client } = make();
    await cms.create("redirects", { from: "/old", to: "/new", permanent: false });
    expect(await client.request("/redirects/lookup", { query: { path: "/old" } })).toEqual({
      to: "/new",
      status: 302,
    });
    await expect(
      client.request("/redirects/lookup", { query: { path: "/nope" } }),
    ).rejects.toMatchObject({ status: 404 });
    const rows = [{ from: "/a", to: "/b" }];
    await expect(
      client.request("/redirects/import", { method: "POST", body: rows }),
    ).rejects.toMatchObject({ status: 401 });
    await client.signUp(admin);
    expect(await client.request("/redirects/import", { method: "POST", body: rows })).toEqual({
      count: 1,
    });
    await expect(
      client.request("/redirects/import", { method: "POST", body: [{ from: "x" }] }),
    ).rejects.toMatchObject({ status: 400 });
    expect(await cms.find("redirects")).toHaveLength(2);
  });

  describe("with localization", () => {
    it("stores the locale of a localized collection and scopes chains to it", async () => {
      const { cms } = make(true);
      const about = await cms.create("pages", { title: "About", slug: "about" });
      await cms.update("pages", about.id, { title: "Ueber", slug: "ueber" }, { locale: "de" });
      await cms.update("pages", about.id, { slug: "ueber-uns" }, { locale: "de" });
      expect(await cms.find("redirects")).toEqual([
        expect.objectContaining({ from: "/ueber", to: "/ueber-uns", locale: "de" }),
      ]);
      // English is untouched and no redirect applies without a locale.
      expect(await resolveRedirect(cms, "/ueber")).toBeUndefined();
      expect(await resolveRedirect(cms, "/ueber", "de")).toEqual({ to: "/ueber-uns", status: 301 });
      expect(await resolveRedirect(cms, "/ueber", "en")).toBeUndefined();
      // Each locale keeps its own redirects.
      await cms.update("pages", about.id, { slug: "about-us" });
      await cms.update("pages", about.id, { slug: "about-new" });
      expect(await resolveRedirect(cms, "/about", "en")).toEqual({ to: "/about-new", status: 301 });
      expect(await resolveRedirect(cms, "/about", "de")).toBeUndefined();
    });

    it("stores no locale for an unlocalized collection and finds it in every locale", async () => {
      const { cms } = make(true, ["posts"]);
      const post = await cms.create("posts", { title: "a", path: "/a" });
      await cms.update("posts", post.id, { path: "/b" });
      const [redirect] = await cms.find("redirects");
      expect(redirect.locale ?? null).toBeNull();
      expect(await resolveRedirect(cms, "/a")).toEqual({ to: "/b", status: 301 });
      expect(await resolveRedirect(cms, "/a", "de")).toEqual({ to: "/b", status: 301 });
    });

    it("keeps `from` unique per locale", async () => {
      const { cms } = make(true);
      await cms.create("redirects", { from: "/team", to: "/crew", locale: "en" });
      await cms.create("redirects", { from: "/team", to: "/mannschaft", locale: "de" });
      await cms.create("redirects", { from: "/team", to: "/all" });
      await expect(
        cms.create("redirects", { from: "/team", to: "/x", locale: "de" }),
      ).rejects.toMatchObject({ errors: { from: "Already used" } });
      await expect(cms.create("redirects", { from: "/team", to: "/x" })).rejects.toMatchObject({
        errors: { from: "Already used" },
      });
      const [en] = await cms.find("redirects", { where: { locale: "en" } });
      await cms.update("redirects", en!.id, { to: "/crew-2" });
    });

    it("limits `locale` to the `locales` option", async () => {
      const { cms } = make(true, ["pages"], ["en", "de"]);
      await cms.create("redirects", { from: "/a", to: "/b", locale: "de" });
      await cms.create("redirects", { from: "/c", to: "/d" });
      await expect(
        cms.create("redirects", { from: "/e", to: "/f", locale: "fr" }),
      ).rejects.toMatchObject({ errors: { locale: expect.anything() } });
    });

    it("looks up by locale over HTTP", async () => {
      const { cms, client } = make();
      await cms.create("redirects", { from: "/x", to: "/en-x", locale: "en" });
      await cms.create("redirects", { from: "/y", to: "/any" });
      const lookup = (query: Record<string, string>) =>
        client.request("/redirects/lookup", { query });
      expect(await lookup({ path: "/x", locale: "en" })).toEqual({ to: "/en-x", status: 301 });
      await expect(lookup({ path: "/x", locale: "de" })).rejects.toMatchObject({ status: 404 });
      await expect(lookup({ path: "/x" })).rejects.toMatchObject({ status: 404 });
      expect(await lookup({ path: "/y", locale: "de" })).toEqual({ to: "/any", status: 301 });
      expect(await lookup({ path: "/y" })).toEqual({ to: "/any", status: 301 });
    });
  });
});
