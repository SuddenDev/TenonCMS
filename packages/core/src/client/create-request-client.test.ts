import { describe, expect, it } from "vitest";
import { createRequestClient } from "./index.ts";

// Records each request the client sends and answers with an empty list.
const recording = () => {
  const sent: Request[] = [];
  const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    sent.push(new Request(input, init));
    return Response.json([]);
  };
  return { sent, fetch };
};

const cms = "https://cms.example.com";

describe("createRequestClient", () => {
  it("sends the page's cookie to the CMS through the caller's fetch", async () => {
    const { sent, fetch } = recording();
    const page = new Request("https://www.example.com/blog", {
      headers: { cookie: "session=1", "x-other": "a" },
    });
    await createRequestClient(page, { baseUrl: cms, fetch }).find("posts" as never);
    expect(sent[0]!.url).toBe(`${cms}/_tenon/collections/posts`);
    expect(sent[0]!.headers.get("cookie")).toBe("session=1");
    expect(sent[0]!.headers.has("x-other")).toBe(false);
  });

  it("takes only the headers of a request", async () => {
    const { sent, fetch } = recording();
    const headers = new Headers({ cookie: "session=1" });
    await createRequestClient({ headers }, { baseUrl: cms, fetch }).find("posts" as never);
    expect(sent[0]!.headers.get("cookie")).toBe("session=1");
  });

  it("sends no cookie for a page without one", async () => {
    const { sent, fetch } = recording();
    const page = new Request("https://www.example.com/");
    await createRequestClient(page, { baseUrl: cms, fetch }).find("posts" as never);
    expect(sent[0]!.headers.has("cookie")).toBe(false);
  });

  it("sends the cookie only to the CMS origin, not to direct storage", async () => {
    const sent: Request[] = [];
    const bucket = "https://bucket.s3.test/a.txt?sig=1";
    const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      sent.push(request);
      if (request.url === bucket) return new Response(null, { headers: { etag: "e" } });
      return Response.json({ id: "u", partSize: 10, parts: [{ n: 1, url: bucket }] });
    };
    const page = new Request("https://www.example.com/", { headers: { cookie: "session=1" } });
    await createRequestClient(page, { baseUrl: cms, fetch }).media.upload(new File(["x"], "a.txt"));

    const cookies = sent.map((r) => [new URL(r.url).origin, r.headers.get("cookie")]);
    expect(cookies).toContainEqual(["https://bucket.s3.test", null]);
    expect(cookies).toContainEqual([cms, "session=1"]);
    expect(cookies.filter(([origin, cookie]) => origin === cms && !cookie)).toEqual([]);
  });
});
