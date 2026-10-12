import { describe, expect, it } from "vitest";
import { createClient } from "integral-cms/client";
import { defineCms, defineCollection } from "integral-cms";
import { page } from "integral-cms/presets";
import { RedirectsPlugin, resolveRedirect } from "./index.ts";

const origin = "http://localhost";
const admin = { name: "Admin", email: "a@b.co", password: "password123" };

function make() {
  const cms = defineCms({
    collections: {
      pages: defineCollection({ fields: page.fields, hooks: page.hooks }),
      posts: defineCollection({ fields: { title: { type: "text" }, path: { type: "text" } } }),
    },
    plugins: [RedirectsPlugin()],
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
});
