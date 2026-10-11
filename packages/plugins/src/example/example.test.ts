import { describe, expect, it } from "vitest";
import { createClient } from "integral-cms/client";
import { defineCms } from "integral-cms";
import { ExamplePlugin } from "./index.ts";

const origin = "http://localhost";
const admin = { name: "Admin", email: "a@b.co", password: "password123" };

function make() {
  const cms = defineCms({
    plugins: [ExamplePlugin()],
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
  return { cms, fetch, client: createClient<typeof cms>({ baseUrl: origin, fetch }) };
}

describe("example", () => {
  it("trims quotes and serves a random one as text", async () => {
    const { cms, fetch } = make();
    expect((await fetch(`${origin}/api/cms/example/random`)).status).toBe(404);
    await cms.create("quotes", { text: "  Less is more.  ", author: "Mies" });
    expect(await (await fetch(`${origin}/api/cms/example/random`)).text()).toBe(
      "Quote of the day: “Less is more.” (Mies)",
    );
    await cms.setGlobal("quoteSettings", { prefix: "Today" });
    const res = await fetch(`${origin}/api/cms/example/random`);
    expect(res.headers.get("content-type")).toMatch(/^text\/plain/);
    expect(await res.text()).toBe("Today: “Less is more.” (Mies)");
  });

  it("marks every response", async () => {
    const { fetch } = make();
    expect((await fetch(`${origin}/api/cms/schema`)).headers.get("x-example")).toBe("1");
  });

  it("exports quotes as CSV for signed-in users", async () => {
    const { cms, client, fetch } = make();
    await cms.create("quotes", { text: 'Say "hi"', author: "Anonymous", rating: "4" });
    expect((await fetch(`${origin}/api/cms/example/quotes.csv`)).status).toBe(401);
    await client.signUp(admin);
    const res = await fetch(`${origin}/api/cms/example/quotes.csv`);
    expect(res.headers.get("content-type")).toMatch(/^text\/csv/);
    expect(await res.text()).toBe('text,author,rating\n"Say ""hi""","Anonymous","4"\n');
  });

  it("loads the stats page with the changes since start", async () => {
    const { cms, client } = make();
    await cms.create("quotes", { text: "One", rating: "5" });
    await cms.create("quotes", { text: "Two", rating: "2" });
    await cms.create("quotes", { text: "Three", rating: "5" });
    await cms.create("quotes", { text: "Four" });
    await client.signUp(admin);
    expect(
      await client.request("/admin/load", {
        method: "POST",
        body: { kind: "page", key: "quote-stats", params: {}, query: {} },
      }),
    ).toMatchObject({
      data: {
        count: 4,
        changes: 4,
        ratings: [0, 1, 0, 0, 2],
        quotes: expect.arrayContaining([expect.objectContaining({ text: "One", rating: "5" })]),
      },
    });
  });

  it("mounts the field and pages with the chosen renderer", () => {
    const { fields, pages } = ExamplePlugin({ renderer: "vue" }).admin!;
    expect(fields!.rating.mount.clientRef).toBe(
      "integral-cms/plugins/example/admin/vue#mountRatingField",
    );
    expect(pages!["quote-stats"].mount.clientRef).toBe(
      "integral-cms/plugins/example/admin/vue#mountStats",
    );
    expect(pages!.quote.mount.clientRef).toBe("integral-cms/plugins/example/admin/vue#mountQuote");
  });
});
