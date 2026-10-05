import type { MediaApi } from "../../schema/hooks/media.ts";

type Options = {
  where?: Record<string, unknown>;
  limit?: number;
  populate?: boolean | object;
  depth?: number;
  select?: Record<string, unknown>;
};
type Row = Record<string, any>;

/** Options of `create`, `update` and `setGlobal`. */
export type WriteOptions = {
  /** Saves a draft: the published data stays. Types are checked, but not `required`, the built-in checks, `validate`, `unique` or ids. */
  draft?: boolean;
};

/** The local API with untyped names and data, as hooks get it. */
export type LocalApi = {
  find(collection: string, options?: Options): Promise<Row[]>;
  findOne(collection: string, options: Options): Promise<Row | undefined>;
  findById(collection: string, id: string, options?: Options): Promise<Row | undefined>;
  create(collection: string, data: Record<string, unknown>, options?: WriteOptions): Promise<Row>;
  update(
    collection: string,
    id: string,
    data: Record<string, unknown>,
    options?: WriteOptions,
  ): Promise<Row | undefined>;
  delete(collection: string, id: string): Promise<void>;
  publish(collection: string, id: string): Promise<Row | undefined>;
  discard(collection: string, id: string): Promise<Row | undefined>;
  getGlobal(name: string, options?: Options): Promise<Row>;
  setGlobal(name: string, data: Record<string, unknown>, options?: WriteOptions): Promise<Row>;
  publishGlobal(name: string): Promise<Row>;
  discardGlobal(name: string): Promise<Row>;
  /** Returns a copy of this API whose reads use the drafts perspective: unpublished documents and pending drafts. */
  withDrafts(): LocalApi;
  /** The media library. Missing without `defineCms({ media })`. */
  media?: MediaApi;
};
