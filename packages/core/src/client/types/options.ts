import type { FilterKey, Locale, ReadOptions, Schema } from "../../schema/index.ts";
import type { CollectionFields, Collections } from "./schema.ts";

/** Options of `createClient()`. */
export type ClientOptions = {
  /** Origin of the host app, e.g. `https://example.com`. Defaults to the current origin. */
  baseUrl?: string;
  /** Custom `fetch`, e.g. one that forwards cookies. Defaults to the global `fetch`. */
  fetch?: typeof fetch;
};

/** Options of `find` and `findOne` for collection `K`. */
export type FindOptions<C extends { schema: Schema }, K extends keyof Collections<C>> = ReadOptions<
  Collections<C>,
  CollectionFields<C, K>,
  true,
  Locale<C>
> & {
  /** Equality filters on field values. `null` matches an empty or missing field. `undefined` adds no filter. */
  where?: Partial<Record<FilterKey<CollectionFields<C, K>>, string | number | boolean | null>>;
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
