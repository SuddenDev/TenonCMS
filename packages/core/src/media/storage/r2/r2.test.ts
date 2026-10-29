import { describe, expect, it } from "vitest";
import { r2 } from "./index.ts";

describe("r2 with API keys", () => {
  it("signs S3 requests to the account's R2 endpoint", async () => {
    const requests: Request[] = [];
    const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push(new Request(input, init));
      return new Response("");
    };
    const storage = r2({
      accountId: "acc",
      bucket: "b",
      accessKeyId: "id",
      secretAccessKey: "secret",
      publicUrl: "https://media.example.com",
      fetch: fetch as typeof globalThis.fetch,
    });

    await storage.delete("a b/x.jpg");

    expect(requests[0].url).toBe("https://acc.r2.cloudflarestorage.com/b/a%20b/x.jpg");
    expect(requests[0].headers.get("authorization")).toContain("/auto/s3/aws4_request");
    expect(storage.partUrl).toBeDefined();
    expect(storage.url("x.jpg")).toBe("https://media.example.com/x.jpg");
  });

  it("uses the regional endpoint", async () => {
    const requests: Request[] = [];
    const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push(new Request(input, init));
      return new Response("");
    };
    const storage = r2({
      accountId: "acc",
      region: "eu",
      bucket: "b",
      accessKeyId: "id",
      secretAccessKey: "secret",
      publicUrl: "https://media.example.com",
      fetch: fetch as typeof globalThis.fetch,
    });

    await storage.delete("x.jpg");

    expect(requests[0].url).toBe("https://acc.eu.r2.cloudflarestorage.com/b/x.jpg");
  });
});
