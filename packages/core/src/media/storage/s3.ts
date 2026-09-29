import { AwsClient } from "aws4fetch";
import { ValidationError } from "../../errors.ts";
import type { Storage } from "./types.ts";

export type S3Options = {
  bucket: string;
  /** Region, e.g. `eu-central-1`. `'auto'` for R2. */
  region: string;
  /**
   * Endpoint of an S3-compatible service, e.g. `https://<account>.r2.cloudflarestorage.com` for R2 or `http://localhost:9000`
   * for MinIO. Requests then use path-style URLs. Default: AWS, with virtual-hosted URLs.
   */
  endpoint?: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Public URL of the bucket, e.g. a custom domain or the R2 public URL. File URLs are `<publicUrl>/<key>`. */
  publicUrl: string;
  /** Part size of uploads in bytes. At least 5 MB, as S3 requires. Default 16 MB. */
  partSize?: number;
  /** Custom `fetch`. Defaults to the global `fetch`. */
  fetch?: typeof fetch;
};

const MB = 1024 ** 2;
// The largest object a single `CopyObject` copies.
const MAX_COPY = 5 * 1024 ** 3;

// S3 signs RFC 3986 paths, which also encode `!'()*`.
const rfc3986 = (s: string) =>
  encodeURIComponent(s).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
const encode = (key: string) => key.split("/").map(rfc3986).join("/");
const tag = (xml: string, name: string) => xml.match(new RegExp(`<${name}>([^<]*)</${name}>`))?.[1];
const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const unescape = (s: string) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");

/**
 * Stores media files in S3 or an S3-compatible service (R2, MinIO). Signs with `aws4fetch`, so it runs on Node and Workers.
 * The browser uploads parts straight to the bucket, which needs CORS: allow `PUT` from the admin origin and expose `ETag`.
 * Add a lifecycle rule that aborts incomplete multipart uploads after one day.
 */
export function s3({
  bucket,
  region,
  endpoint,
  accessKeyId,
  secretAccessKey,
  publicUrl,
  partSize = 16 * MB,
  fetch: fetchFn = (...args) => fetch(...args),
}: S3Options): Storage {
  const client = new AwsClient({ accessKeyId, secretAccessKey, region, service: "s3" });
  const objectUrl = (key: string, query: Record<string, string | number> = {}) => {
    const url = new URL(
      endpoint
        ? `${endpoint.replace(/\/$/, "")}/${bucket}/${encode(key)}`
        : `https://${bucket}.s3.${region}.amazonaws.com/${encode(key)}`,
    );
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, String(v));
    return url.href;
  };

  // A signed request. Throws for an error status, and for an error inside a 200, which S3 sends for some slow operations.
  async function send(
    method: string,
    key: string,
    {
      query,
      headers,
      body,
    }: { query?: Record<string, string | number>; headers?: HeadersInit; body?: BodyInit } = {},
    ok: number[] = [],
  ) {
    const res = await fetchFn(await client.sign(objectUrl(key, query), { method, headers, body }));
    if (ok.includes(res.status)) return { res, text: "" };
    const text = method === "GET" || method === "HEAD" ? "" : await res.text();
    if (!res.ok || text.includes("<Error>"))
      throw new Error(`S3 ${method} ${key} failed: ${res.status} ${tag(text, "Code") ?? text}`);
    return { res, text };
  }

  const size = async (key: string) => {
    const { res } = await send("HEAD", key, {}, [404]);
    return res.status === 404 ? undefined : Number(res.headers.get("content-length"));
  };

  async function createUpload(key: string, { mimeType }: { mimeType: string }) {
    const { text } = await send("POST", key, {
      query: { uploads: "" },
      headers: { "content-type": mimeType },
    });
    const uploadId = tag(text, "UploadId");
    if (!uploadId) throw new Error(`S3 did not return an UploadId for ${key}`);
    return { uploadId };
  }

  async function complete(key: string, uploadId: string, parts: { n: number; etag: string }[]) {
    if (parts.some((p) => !p.etag))
      throw new ValidationError({
        "": "A part has no ETag. The bucket's CORS setting MUST expose the ETag header.",
      });
    const xml = [...parts]
      .sort((a, b) => a.n - b.n)
      .map((p) => `<Part><PartNumber>${p.n}</PartNumber><ETag>${escape(p.etag)}</ETag></Part>`)
      .join("");
    await send("POST", key, {
      query: { uploadId },
      body: `<CompleteMultipartUpload>${xml}</CompleteMultipartUpload>`,
    });
    return { size: (await size(key)) ?? 0 };
  }

  // `UploadPartCopy` in parts of at least 512 MB, for objects above 5 GB.
  async function copyInParts(from: string, to: string, total: number) {
    const { uploadId } = await createUpload(to, { mimeType: "application/octet-stream" });
    const step = Math.max(512 * MB, Math.ceil(total / 10_000));
    const parts: { n: number; etag: string }[] = [];
    try {
      for (let start = 0, n = 1; start < total; start += step, n++) {
        const end = Math.min(start + step, total) - 1;
        const { text } = await send("PUT", to, {
          query: { partNumber: n, uploadId },
          headers: {
            "x-amz-copy-source": `/${bucket}/${encode(from)}`,
            "x-amz-copy-source-range": `bytes=${start}-${end}`,
          },
        });
        parts.push({ n, etag: tag(text, "ETag")!.replace(/&quot;/g, '"') });
      }
      await complete(to, uploadId, parts);
    } catch (error) {
      await send("DELETE", to, { query: { uploadId } }).catch(() => {});
      throw error;
    }
  }

  return {
    partSize: Math.max(partSize, 5 * MB),
    createUpload,
    async partUrl(key, uploadId, n, expiresIn) {
      const url = objectUrl(key, { partNumber: n, uploadId, "X-Amz-Expires": expiresIn });
      return (await client.sign(url, { method: "PUT", aws: { signQuery: true } })).url;
    },
    complete,
    async abort(key, uploadId) {
      await send("DELETE", key, { query: { uploadId } }, [404]);
    },
    async get(key, range) {
      const headers = range ? { range: `bytes=${range.start}-${range.end}` } : undefined;
      const { res } = await send("GET", key, { headers }, [404]);
      if (res.status === 404 || !res.body) return undefined;
      const total = res.headers.get("content-range")?.split("/")[1];
      return { body: res.body, size: Number(total ?? res.headers.get("content-length")) };
    },
    async put(key, data, mimeType) {
      await send("PUT", key, { body: data as BodyInit, headers: { "content-type": mimeType } });
    },
    async list(prefix) {
      const keys: string[] = [];
      let token: string | undefined;
      do {
        const query: Record<string, string> = { "list-type": "2", prefix };
        if (token) query["continuation-token"] = token;
        const res = await fetchFn(await client.sign(objectUrl("", query)));
        const text = await res.text();
        if (!res.ok)
          throw new Error(`S3 list ${prefix} failed: ${res.status} ${tag(text, "Code") ?? text}`);
        for (const [, key] of text.matchAll(/<Key>([^<]*)<\/Key>/g)) keys.push(unescape(key));
        token = text.includes("<IsTruncated>true</IsTruncated>")
          ? tag(text, "NextContinuationToken")
          : undefined;
      } while (token);
      return keys;
    },
    async move(from, to) {
      const total = await size(from);
      if (total === undefined) return;
      if (total > MAX_COPY) await copyInParts(from, to, total);
      else
        await send("PUT", to, { headers: { "x-amz-copy-source": `/${bucket}/${encode(from)}` } });
      await send("DELETE", from);
    },
    async delete(key) {
      await send("DELETE", key, {}, [404]);
    },
    url: (key) => `${publicUrl.replace(/\/$/, "")}/${encode(key)}`,
  };
}
