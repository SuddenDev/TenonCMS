import type { Storage } from "../types.ts";
import { createClient } from "./client.ts";
import { encodePath, tag, unescapeXml } from "./encoding.ts";
import { s3Multipart } from "./multipart.ts";

/** Options of `s3()`. */
export type S3Options = {
  bucket: string;
  /** Region, e.g. `eu-central-1`. `'auto'` for R2. */
  region: string;
  /**
   * Endpoint of an S3-compatible service, e.g. `https://<account>.r2.cloudflarestorage.com` for R2 or `http://localhost:9000`
   * for MinIO. Requests then use path-style URLs. Default: AWS, with virtual-hosted URLs.
   */
  endpoint?: string;
  /** Access key ID for the S3-compatible service. */
  accessKeyId: string;
  /** Secret access key for the S3-compatible service. */
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

/**
 * Stores media files in S3 or an S3-compatible service (R2, MinIO). Signs with `aws4fetch`, so it runs on Node and Workers.
 * The browser uploads parts straight to the bucket, which needs CORS: allow `PUT` from the admin origin and expose `ETag`.
 * Add a lifecycle rule that aborts incomplete multipart uploads after one day.
 */
export function s3(options: S3Options): Storage {
  const { publicUrl, partSize = 16 * MB } = options;
  const client = createClient(options);
  const { copyInParts, ...uploads } = s3Multipart(client);

  return {
    partSize: Math.max(partSize, 5 * MB),
    ...uploads,

    async get(key, range) {
      const headers = range ? { range: `bytes=${range.start}-${range.end}` } : undefined;
      const { res } = await client.send("GET", key, { headers }, [404]);
      if (res.status === 404 || !res.body) return undefined;
      // A range response carries the whole size after the slash: `bytes 0-0/1234`.
      const total = res.headers.get("content-range")?.split("/")[1];
      return { body: res.body, size: Number(total ?? res.headers.get("content-length")) };
    },

    async put(key, data, mimeType) {
      await client.send("PUT", key, {
        body: data as BodyInit,
        headers: { "content-type": mimeType },
      });
    },

    async list(prefix) {
      const keys: string[] = [];
      let token: string | undefined;
      do {
        const query: Record<string, string> = { "list-type": "2", prefix };
        if (token) query["continuation-token"] = token;
        const res = await client.fetchSigned("", query);
        const text = await res.text();
        if (!res.ok)
          throw new Error(`S3 list ${prefix} failed: ${res.status} ${tag(text, "Code") ?? text}`);
        for (const [, key] of text.matchAll(/<Key>([^<]*)<\/Key>/g)) keys.push(unescapeXml(key));
        token = text.includes("<IsTruncated>true</IsTruncated>")
          ? tag(text, "NextContinuationToken")
          : undefined;
      } while (token);
      return keys;
    },

    async move(from, to) {
      const total = await client.size(from);
      if (total === undefined) return;
      if (total > MAX_COPY) await copyInParts(from, to, total);
      else
        await client.send("PUT", to, { headers: { "x-amz-copy-source": client.copySource(from) } });
      await client.send("DELETE", from);
    },

    async delete(key) {
      await client.send("DELETE", key, {}, [404]);
    },

    url: (key) => `${publicUrl.replace(/\/$/, "")}/${encodePath(key)}`,
  };
}
