import { AwsClient } from "aws4fetch";
import { encodePath, tag } from "./encoding.ts";
import type { S3Credentials, S3Options } from "./index.ts";

type Query = Record<string, string | number>;
type Request = { query?: Query; headers?: HeadersInit; body?: BodyInit };

/** Signed requests to one bucket. */
export type S3Client = ReturnType<typeof createClient>;

/** Binds signing and URLs to the bucket of `options`. */
export function createClient({
  bucket,
  region,
  endpoint,
  fetch: fetchFn = (...args) => fetch(...args),
  ...keys
}: S3Options) {
  const sign = createSigner(region, keys);

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

    const res = await fetchFn(await sign(objectUrl(key, query), { method, headers, body }));
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
    fetchSigned: async (key: string, query: Query) => fetchFn(await sign(objectUrl(key, query))),
    /** A presigned URL that is valid without further headers. */
    presign: async (method: string, key: string, query: Query) =>
      (await sign(objectUrl(key, query), { method, aws: { signQuery: true } })).url,
    /** The size of `key`, or `undefined` for a missing one. */
    async size(key: string) {
      const { res } = await send("HEAD", key, {}, [404]);
      return res.status === 404 ? undefined : Number(res.headers.get("content-length"));
    },
    /** The `x-amz-copy-source` header value of `key`. */
    copySource: (key: string) => `/${bucket}/${encodePath(key)}`,
  };
}

const RENEW_BEFORE = 5 * 60_000;

// Static keys sign with one client, created on first use: `AwsClient` throws for missing keys, which `s3()` reports as
// problems instead. A provider's credentials are kept until they expire within `RENEW_BEFORE`.
// Returns `AwsClient.sign()` over the current credentials.
function createSigner(
  region: string,
  keys: Pick<S3Options, "accessKeyId" | "secretAccessKey" | "credentials">,
) {
  const create = (c: S3Credentials) => new AwsClient({ ...c, region, service: "s3" });
  const { credentials } = keys;
  let fixed: AwsClient | undefined;

  let cached: { aws: AwsClient; until: number } | undefined;
  async function current() {
    if (!credentials) return (fixed ??= create(keys as S3Credentials));
    if (cached && Date.now() < cached.until) return cached.aws;
    const c = await credentials!();
    const until = c.expiration ? c.expiration.getTime() - RENEW_BEFORE : 0;
    cached = { aws: create(c), until };
    return cached.aws;
  }

  return async (...args: Parameters<AwsClient["sign"]>) => (await current()).sign(...args);
}
