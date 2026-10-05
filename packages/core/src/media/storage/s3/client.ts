import { AwsClient } from "aws4fetch";
import { encodePath, tag } from "./encoding.ts";
import type { S3Options } from "./index.ts";

type Query = Record<string, string | number>;
type Request = { query?: Query; headers?: HeadersInit; body?: BodyInit };

/** Signed requests to one bucket. */
export type S3Client = ReturnType<typeof createClient>;

/** Binds signing and URLs to the bucket of `options`. */
export function createClient({
  bucket,
  region,
  endpoint,
  accessKeyId,
  secretAccessKey,
  fetch: fetchFn = (...args) => fetch(...args),
}: S3Options) {
  const aws = new AwsClient({ accessKeyId, secretAccessKey, region, service: "s3" });

  // Path-style URLs for a custom endpoint, virtual-hosted URLs for AWS.
  function objectUrl(key: string, query: Query = {}) {
    const url = new URL(
      endpoint
        ? `${endpoint.replace(/\/$/, "")}/${bucket}/${encodePath(key)}`
        : `https://${bucket}.s3.${region}.amazonaws.com/${encodePath(key)}`,
    );
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, String(v));
    return url.href;
  }

  /**
   * A signed request. Statuses in `ok` return without a check. Other errors throw, and so does an error inside a 200,
   * which S3 sends for some slow operations. `text` is empty for `GET` and `HEAD`, whose body the caller reads.
   */
  async function send(method: string, key: string, request: Request = {}, ok: number[] = []) {
    const { query, headers, body } = request;

    const res = await fetchFn(await aws.sign(objectUrl(key, query), { method, headers, body }));
    if (ok.includes(res.status)) return { res, text: "" };
    const text = method === "GET" || method === "HEAD" ? "" : await res.text();
    if (!res.ok || text.includes("<Error>")) {
      throw new Error(`S3 ${method} ${key} failed: ${res.status} ${tag(text, "Code") ?? text}`);
    }

    return { res, text };
  }

  return {
    send,
    /** A signed `GET` of `key` without status checks. */
    fetchSigned: async (key: string, query: Query) =>
      fetchFn(await aws.sign(objectUrl(key, query))),
    /** A presigned URL that is valid without further headers. */
    presign: async (method: string, key: string, query: Query) =>
      (await aws.sign(objectUrl(key, query), { method, aws: { signQuery: true } })).url,
    /** The size of `key`, or `undefined` for a missing one. */
    async size(key: string) {
      const { res } = await send("HEAD", key, {}, [404]);
      return res.status === 404 ? undefined : Number(res.headers.get("content-length"));
    },
    /** The `x-amz-copy-source` header value of `key`. */
    copySource: (key: string) => `/${bucket}/${encodePath(key)}`,
  };
}
