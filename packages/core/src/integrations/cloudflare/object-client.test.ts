import { describe, expect, it } from "vitest";
import { createObjectClient } from "./object-client.ts";

const recording = () => {
  const sent: Request[] = [];
  const stub = {
    fetch: async (request: Request) => {
      sent.push(request);
      return Response.json([]);
    },
  };
  return { sent, stub };
};

describe("createObjectClient", () => {
  it("sends to the object on the page's origin, with its cookie", async () => {
    const { sent, stub } = recording();
    const page = new Request("https://site.test/blog", { headers: { cookie: "session=1" } });
    await createObjectClient(page, stub).find("posts" as never);
    expect(sent[0]!.url).toBe("https://site.test/api/cms/collections/posts");
    expect(sent[0]!.headers.get("cookie")).toBe("session=1");
  });

  it("sends no cookie for a page without one", async () => {
    const { sent, stub } = recording();
    await createObjectClient(new Request("https://site.test/"), stub).find("posts" as never);
    expect(sent[0]!.headers.has("cookie")).toBe(false);
  });
});
