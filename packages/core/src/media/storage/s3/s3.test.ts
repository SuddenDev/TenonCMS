import { describe, expect, it } from "vitest";
import { s3 } from "./index.ts";

type Call = { method: string; url: URL; headers: Headers; body: string };

// Records every request and answers from `reply`, 200 with an empty body by default.
function fake(reply: (call: Call) => Response | undefined = () => undefined) {
  const calls: Call[] = [];
  const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init);
    const call = {
      method: req.method,
      url: new URL(req.url),
      headers: req.headers,
      body: await req.text(),
    };
    calls.push(call);
    return reply(call) ?? new Response("");
  };
  return { calls, fetch: fetch as typeof globalThis.fetch };
}

const options = {
  bucket: "b",
  region: "auto",
  endpoint: "https://acc.r2.cloudflarestorage.com",
  accessKeyId: "id",
  secretAccessKey: "secret",
  publicUrl: "https://media.example.com",
};

describe("s3", () => {
  it("starts a multipart upload, path-style on the endpoint", async () => {
    const { calls, fetch } = fake(
      () =>
        new Response(
          "<InitiateMultipartUploadResult><UploadId>u1</UploadId></InitiateMultipartUploadResult>",
        ),
    );
    const storage = s3({ ...options, fetch });
    expect(
      await storage.createUpload("a b/x.jpg", { size: 1, mimeType: "image/jpeg", parts: 1 }),
    ).toEqual({
      uploadId: "u1",
    });
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url.href).toBe("https://acc.r2.cloudflarestorage.com/b/a%20b/x.jpg?uploads=");
    expect(calls[0].headers.get("content-type")).toBe("image/jpeg");
    expect(calls[0].headers.get("authorization")).toContain("AWS4-HMAC-SHA256");
  });

  it("links files to the bucket's public URL, or to core for a private bucket", () => {
    expect(s3(options).url("a b/x.jpg")).toBe("https://media.example.com/a%20b/x.jpg");
    const { publicUrl: _, ...unlisted } = options;
    expect(s3(unlisted).url("a b/x.jpg")).toBe("/_tenon/media/files/a%20b/x.jpg");
  });

  it("uses virtual-hosted URLs on AWS", async () => {
    const { calls, fetch } = fake();
    await s3({ ...options, region: "eu-central-1", endpoint: undefined, fetch }).delete("x.jpg");
    expect(calls[0].url.href).toBe("https://b.s3.eu-central-1.amazonaws.com/x.jpg");
  });

  it("presigns part URLs", async () => {
    const url = new URL(await s3(options).partUrl!("x.jpg", "u1", 3, 3600));
    expect(url.pathname).toBe("/b/x.jpg");
    expect(url.searchParams.get("partNumber")).toBe("3");
    expect(url.searchParams.get("uploadId")).toBe("u1");
    expect(url.searchParams.get("X-Amz-Expires")).toBe("3600");
    expect(url.searchParams.get("X-Amz-Signature")).toBeTruthy();
  });

  it("completes with parts sorted by number, then reads the size", async () => {
    const { calls, fetch } = fake((c) =>
      c.method === "HEAD" ? new Response(null, { headers: { "content-length": "42" } }) : undefined,
    );
    const storage = s3({ ...options, fetch });
    const result = await storage.complete("x.jpg", "u1", [
      { n: 2, etag: '"b"' },
      { n: 1, etag: '"a"' },
    ]);
    expect(result).toEqual({ size: 42 });
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url.searchParams.get("uploadId")).toBe("u1");
    expect(calls[0].body).toBe(
      '<CompleteMultipartUpload><Part><PartNumber>1</PartNumber><ETag>"a"</ETag></Part><Part><PartNumber>2</PartNumber><ETag>"b"</ETag></Part></CompleteMultipartUpload>',
    );
    expect(calls[1].method).toBe("HEAD");
  });

  it("throws an error inside a 200 response", async () => {
    const { fetch } = fake(() => new Response("<Error><Code>InternalError</Code></Error>"));
    await expect(
      s3({ ...options, fetch }).complete("x.jpg", "u1", [{ n: 1, etag: "a" }]),
    ).rejects.toThrow("InternalError");
  });

  it("names the CORS setting for a part without ETag, before any request", async () => {
    const { calls, fetch } = fake();
    await expect(
      s3({ ...options, fetch }).complete("x.jpg", "u1", [{ n: 1, etag: "" }]),
    ).rejects.toThrow(/CORS/);
    expect(calls).toEqual([]);
  });

  it("moves by copy and delete", async () => {
    const { calls, fetch } = fake((c) =>
      c.method === "HEAD" ? new Response(null, { headers: { "content-length": "10" } }) : undefined,
    );
    await s3({ ...options, fetch }).move("a/x.jpg", "b/y.jpg");
    expect(calls.map((c) => c.method)).toEqual(["HEAD", "PUT", "DELETE"]);
    expect(calls[1].url.pathname).toBe("/b/b/y.jpg");
    expect(calls[1].headers.get("x-amz-copy-source")).toBe("/b/a/x.jpg");
    expect(calls[2].url.pathname).toBe("/b/a/x.jpg");
  });

  it("lists keys under a prefix across pages", async () => {
    const page = (keys: string[], next?: string) =>
      new Response(
        `<ListBucketResult>${keys.map((k) => `<Contents><Key>${k}</Key></Contents>`).join("")}` +
          (next
            ? `<IsTruncated>true</IsTruncated><NextContinuationToken>${next}</NextContinuationToken>`
            : "") +
          "</ListBucketResult>",
      );
    const { calls, fetch } = fake((c) =>
      c.url.searchParams.get("continuation-token") === "t2"
        ? page([".variants/a.png/w_2"])
        : page([".variants/a.png/f_webp&amp;w_1"], "t2"),
    );
    expect(await s3({ ...options, fetch }).list(".variants/a.png/")).toEqual([
      ".variants/a.png/f_webp&w_1",
      ".variants/a.png/w_2",
    ]);
    expect(calls[0].url.pathname).toBe("/b/");
    expect(calls[0].url.searchParams.get("list-type")).toBe("2");
    expect(calls[0].url.searchParams.get("prefix")).toBe(".variants/a.png/");
  });

  it("does nothing when moving a missing key", async () => {
    const { calls, fetch } = fake(() => new Response(null, { status: 404 }));
    await s3({ ...options, fetch }).move("a/x.jpg", "b/y.jpg");
    expect(calls.map((c) => c.method)).toEqual(["HEAD"]);
  });

  it("copies in parts above 5 GB", async () => {
    const size = 6 * 1024 ** 3;
    const { calls, fetch } = fake((c) => {
      if (c.method === "HEAD")
        return new Response(null, { headers: { "content-length": String(size) } });
      if (c.url.searchParams.has("uploads"))
        return new Response(
          "<InitiateMultipartUploadResult><UploadId>u2</UploadId></InitiateMultipartUploadResult>",
        );
      if (c.url.searchParams.has("partNumber"))
        return new Response(
          `<CopyPartResult><ETag>"e${c.url.searchParams.get("partNumber")}"</ETag></CopyPartResult>`,
        );
    });
    await s3({ ...options, fetch }).move("a.bin", "b.bin");
    const parts = calls.filter((c) => c.url.searchParams.has("partNumber"));
    expect(parts.length).toBeGreaterThan(1);
    expect(parts[0].headers.get("x-amz-copy-source-range")).toMatch(/^bytes=0-\d+$/);
    expect(parts.at(-1)!.headers.get("x-amz-copy-source-range")).toMatch(
      new RegExp(`-${size - 1}$`),
    );
    const complete = calls.find(
      (c) => c.method === "POST" && c.url.searchParams.get("uploadId") === "u2",
    )!;
    expect(complete.body).toContain('<ETag>"e1"</ETag>');
    expect(calls.at(-1)!.method).toBe("DELETE");
  });

  it("gets a range and reads the total size", async () => {
    const { calls, fetch } = fake(
      () => new Response("abc", { status: 206, headers: { "content-range": "bytes 0-2/10" } }),
    );
    const file = await s3({ ...options, fetch }).get("x.jpg", { start: 0, end: 2 });
    expect(file?.size).toBe(10);
    expect(await new Response(file!.body).text()).toBe("abc");
    expect(calls[0].headers.get("range")).toBe("bytes=0-2");
  });

  it("builds public URLs and raises the part size to 5 MB", () => {
    expect(s3(options).url("a b/x.jpg")).toBe("https://media.example.com/a%20b/x.jpg");
    expect(s3({ ...options, partSize: 1024 }).partSize).toBe(5 * 1024 ** 2);
  });

  it("signs with temporary credentials from a provider, with their session token", async () => {
    const { calls, fetch } = fake();
    const { accessKeyId, secretAccessKey, ...rest } = options;
    const credentials = async () => ({ accessKeyId, secretAccessKey, sessionToken: "t1" });
    await s3({ ...rest, credentials, fetch }).delete("x.jpg");
    expect(calls[0].headers.get("x-amz-security-token")).toBe("t1");
    const url = new URL(await s3({ ...rest, credentials }).partUrl!("x.jpg", "u1", 1, 3600));
    expect(url.searchParams.get("X-Amz-Security-Token")).toBe("t1");
  });

  it("asks the provider again only when the credentials expire within 5 minutes", async () => {
    const { calls, fetch } = fake();
    const { accessKeyId, secretAccessKey, ...rest } = options;
    let minutes = 4;
    let asked = 0;
    const credentials = async () => ({
      accessKeyId,
      secretAccessKey,
      sessionToken: `t${++asked}`,
      expiration: new Date(Date.now() + minutes * 60_000),
    });
    const storage = s3({ ...rest, credentials, fetch });
    await storage.delete("a.jpg");
    await storage.delete("b.jpg");
    expect(asked).toBe(2);
    minutes = 60;
    await storage.delete("c.jpg");
    await storage.delete("d.jpg");
    expect(asked).toBe(3);
    expect(calls[3].headers.get("x-amz-security-token")).toBe("t3");
  });
});

describe("s3 options", () => {
  it("reports missing options instead of throwing", () => {
    const missing = undefined as unknown as string;
    expect(s3({ ...options, bucket: "", region: missing, accessKeyId: missing }).problems).toEqual([
      "`bucket` is missing",
      "`region` is missing",
      "`accessKeyId` is missing",
    ]);
    expect(s3(options).problems).toEqual([]);
  });
});
