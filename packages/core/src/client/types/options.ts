import type { FilterKey, Locale, ReadOptions, Schema } from "../../schema/index.ts";
import type { ImportMode } from "../../transfer/format.ts";
import type { CollectionFields, Collections } from "./schema.ts";

/** Options of `createClient()`. */
export type ClientOptions = {
  /** Origin of the host app, e.g. `https://example.com`. Defaults to the current origin. */
  baseUrl?: string;
  /** Custom `fetch`, e.g. one that forwards cookies. Defaults to the global `fetch`. */
  fetch?: typeof fetch;
  /**
   * An API key, sent as `x-api-key` on every request. The client then acts as the key, within its permissions. For
   * server code only: a key MUST NOT reach a browser.
   */
  apiKey?: string;
};

/** Options of `find` and `findOne` for collection `K`. */
export type FindOptions<C extends { schema: Schema }, K extends keyof Collections<C>> = ReadOptions<
  Collections<C>,
  CollectionFields<C, K>,
  true,
  Locale<C>
> & {
  /**
   * Equality filters on field values, and on `createdBy` / `updatedBy` (user ids). `null` matches an empty or missing
   * field. `undefined` adds no filter.
   */
  where?: Partial<
    Record<
      FilterKey<CollectionFields<C, K>> | "createdBy" | "updatedBy",
      string | number | boolean | null
    >
  >;
  /** Maximum number of documents. */
  limit?: number;
};

/** Options of `client.media.upload()`. */
export type UploadOptions = {
  /** Folder to upload into, e.g. `blog/2026`. Default: the root. */
  folder?: string;
  /** Name of the file. Default: `file.name`. */
  filename?: string;
  /** Called after each finished part with the bytes uploaded so far. */
  onProgress?(progress: { loaded: number; total: number }): void;
  /** Aborts the upload. Parts in storage are dropped. */
  signal?: AbortSignal;
};

/** Options of `client.import()`. See `cms.import()` for `mode`. */
export type ImportOptions = Pick<UploadOptions, "onProgress" | "signal"> & { mode?: ImportMode };
