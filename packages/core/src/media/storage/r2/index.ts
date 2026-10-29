import { API_BASE } from "../../../client/index.ts";
import { s3 } from "../s3/index.ts";
import { encodeKey, type Storage } from "../types.ts";

type R2Object = { size: number; httpMetadata?: { contentType?: string } };
type R2Body = ReadableStream<Uint8Array> | Uint8Array;

/** The part of an R2 bucket binding that {@link r2} uses. */
export type R2Bucket = {
  get(
    key: string,
    options?: { range?: { offset: number; length: number } },
  ): Promise<(R2Object & { body: ReadableStream<Uint8Array> }) | null>;
  put(
    key: string,
    value: R2Body,
    options?: { httpMetadata?: R2Object["httpMetadata"] },
  ): Promise<unknown>;
  delete(key: string): Promise<void>;
  list(options: { prefix: string; cursor?: string }): Promise<{
    objects: { key: string }[];
    truncated: boolean;
    cursor?: string;
  }>;
  createMultipartUpload(
    key: string,
    options?: { httpMetadata?: R2Object["httpMetadata"] },
  ): Promise<{ uploadId: string }>;
  resumeMultipartUpload(
    key: string,
    uploadId: string,
  ): {
    uploadPart(n: number, value: Uint8Array): Promise<{ partNumber: number; etag: string }>;
    complete(parts: { partNumber: number; etag: string }[]): Promise<R2Object>;
    abort(): Promise<void>;
  };
};

/** Options of `r2()`. */
export type R2Options = {
  /** Part size of uploads in bytes. At least 5 MB, as R2 requires. Default 16 MB. */
  partSize?: number;
  /**
   * Public URL of the bucket, e.g. its custom domain. File URLs are `<publicUrl>/<key>`. Default: core serves files at
   * `/api/cms/media/files/<key>`.
   */
  publicUrl?: string;
};

/** Options of `r2()` with API keys. */
export type R2ApiOptions = {
  /** Cloudflare account ID. Requests go to `https://<accountId>.r2.cloudflarestorage.com`. */
  accountId: string;
  /**
   * Where the bucket lives. Set `"eu"` for a bucket created with the EU data location. Requests then go to
   * `https://<accountId>.eu.r2.cloudflarestorage.com`. `"default"` or omitted: the automatic location.
   */
  region?: "default" | "eu";
  bucket: string;
  /** Access key ID of an R2 API token. */
  accessKeyId: string;
  /** Secret access key of an R2 API token. */
  secretAccessKey: string;
  /**
   * Public URL of the bucket, e.g. its custom domain. File URLs are `<publicUrl>/<key>`. Default: the bucket stays private and
   * core serves files at `/api/cms/media/files/<key>`.
   */
  publicUrl?: string;
  /** Part size of uploads in bytes. At least 5 MB, as R2 requires. Default 16 MB. */
  partSize?: number;
  /** Custom `fetch`. Defaults to the global `fetch`. */
  fetch?: typeof fetch;
};

const MB = 1024 ** 2;

/**
 * Stores media files in R2 through a bucket binding, e.g. `r2(env.MEDIA)` with `env` from `cloudflare:workers`. Needs no
 * keys and no CORS. Uploads stream through the Worker part by part; each part is held in memory. Workers only.
 */
export function r2(bucket: R2Bucket, options?: R2Options): Storage;
/**
 * Stores media files in R2 through its S3 API, like `s3()`. Runs on Node and Workers. The browser uploads parts straight
 * to the bucket, which needs CORS: allow `PUT` from the admin origin and expose `ETag`.
 */
export function r2(options: R2ApiOptions): Storage;
export function r2(source: R2Bucket | R2ApiOptions, options?: R2Options): Storage {
  if (!("accountId" in source)) return r2Binding(source, options);
  const { accountId, region, ...rest } = source;
  const host = [accountId, region === "eu" && "eu", "r2.cloudflarestorage.com"]
    .filter(Boolean)
    .join(".");
  return s3({ ...rest, region: "auto", endpoint: `https://${host}` });
}

function r2Binding(bucket: R2Bucket, { partSize = 16 * MB, publicUrl }: R2Options = {}): Storage {
  return {
    partSize: Math.max(partSize, 5 * MB),

    createUpload: (key, { mimeType }) =>
      bucket.createMultipartUpload(key, { httpMetadata: { contentType: mimeType } }),

    async putPart(key, uploadId, n, body, maxBytes) {
      const bytes = await readAtMost(body, maxBytes);
      const { etag } = await bucket.resumeMultipartUpload(key, uploadId).uploadPart(n, bytes);
      return { etag };
    },

    async complete(key, uploadId, parts) {
      const sorted = parts.toSorted((a, b) => a.n - b.n);
      const { size } = await bucket
        .resumeMultipartUpload(key, uploadId)
        .complete(sorted.map(({ n, etag }) => ({ partNumber: n, etag })));
      return { size };
    },

    abort: (key, uploadId) => bucket.resumeMultipartUpload(key, uploadId).abort(),

    async get(key, range) {
      const options = range && {
        range: { offset: range.start, length: range.end - range.start + 1 },
      };
      const file = await bucket.get(key, options);
      return file ? { body: file.body, size: file.size } : undefined;
    },

    async put(key, data, mimeType) {
      await bucket.put(key, data, { httpMetadata: { contentType: mimeType } });
    },

    async list(prefix) {
      const keys: string[] = [];
      let cursor: string | undefined;
      do {
        const page = await bucket.list({ prefix, cursor });
        keys.push(...page.objects.map((o) => o.key));
        cursor = page.truncated ? page.cursor : undefined;
      } while (cursor);
      return keys;
    },

    // ponytail: R2 bindings cannot copy, so a move reads the file through the Worker.
    async move(from, to) {
      const file = await bucket.get(from);
      if (!file) return;
      await bucket.put(to, file.body, { httpMetadata: file.httpMetadata });
      await bucket.delete(from);
    },

    delete: (key) => bucket.delete(key),

    url: (key) =>
      publicUrl
        ? `${publicUrl.replace(/\/$/, "")}/${encodeKey(key)}`
        : `${API_BASE}/media/files/${encodeKey(key)}`,
  };
}

// R2 needs the length of a part up front, so the part is read into memory.
async function readAtMost(body: ReadableStream<Uint8Array>, maxBytes: number) {
  const chunks: Uint8Array[] = [];
  let length = 0;
  for await (const chunk of body) {
    length += chunk.length;
    if (length > maxBytes)
      throw new Error(`integral-cms: a part MUST NOT exceed ${maxBytes} bytes`);
    chunks.push(chunk);
  }
  return new Uint8Array(await new Blob(chunks as BlobPart[]).arrayBuffer());
}
