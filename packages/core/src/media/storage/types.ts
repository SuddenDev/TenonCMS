/**
 * Where media files live. Pass one to `defineCms({ media: { storage } })`: `local()` or `s3()`, or your own.
 * An adapter implements exactly one of `partUrl` (the browser uploads to storage) and `putPart` (core streams parts in).
 * Moving or deleting a missing key MUST do nothing.
 */
export type Storage = {
  /** Default part size in bytes. */
  partSize: number;
  /** Starts a multipart upload of `parts` parts. */
  createUpload(
    key: string,
    info: { size: number; mimeType: string; parts: number },
  ): Promise<{ uploadId: string }>;
  /** Direct uploads (S3): a presigned URL the browser PUTs part `n` to. */
  partUrl?(key: string, uploadId: string, n: number, expiresIn: number): Promise<string>;
  /**
   * Proxied uploads (local): core streams part `n` into the adapter. `maxBytes` is the upload's part size, so part `n`
   * starts at `(n - 1) * maxBytes`. The adapter MUST stop writing at `maxBytes`.
   */
  putPart?(
    key: string,
    uploadId: string,
    n: number,
    body: ReadableStream<Uint8Array>,
    maxBytes: number,
  ): Promise<{ etag: string }>;
  /** Assembles the parts into the file at `key`. Returns its real size. */
  complete(
    key: string,
    uploadId: string,
    parts: { n: number; etag: string }[],
  ): Promise<{ size: number }>;
  /** Drops an unfinished upload. */
  abort(key: string, uploadId: string): Promise<void>;
  /** The file, or bytes `start` to `end` (inclusive) of it. `size` is the size of the whole file. `undefined` for a missing key. */
  get(
    key: string,
    range?: { start: number; end: number },
  ): Promise<{ body: ReadableStream<Uint8Array>; size: number } | undefined>;
  /** Writes a small file in one go, e.g. a rendered variant. */
  put(key: string, data: Uint8Array, mimeType: string): Promise<void>;
  /** Every key that starts with `prefix`, in any order. Core lists `.variants/<key>/` to find a file's variants. */
  list(prefix: string): Promise<string[]>;
  move(from: string, to: string): Promise<void>;
  delete(key: string): Promise<void>;
  /** The public URL of a file. */
  url(key: string): string;
};

/** A key as a URL path: each segment encoded. */
export const encodeKey = (key: string) => key.split("/").map(encodeURIComponent).join("/");
