import type { ConflictOptions, DeleteOptions } from "../../errors.ts";
import type { EmailApi } from "../../email/types.ts";
import type { JobsApi } from "../../jobs/types.ts";
import type { ScheduleOptions } from "../../schedule/types.ts";
import type { MediaApi } from "../../schema/hooks/media.ts";
import type {
  AppliedStructure,
  StructureCounts,
  SyncChoice,
  SyncStructureOptions,
} from "../../content/writes/sync-structure.ts";

type Options = {
  where?: Record<string, unknown>;
  limit?: number;
  populate?: boolean | object;
  depth?: number;
  select?: Record<string, unknown>;
  /** The locale to read. Default: the default locale. Unlocalized collections ignore it. */
  locale?: string;
  /** Whether a missing value or locale reads as the default locale's. Default: `localization.fallback`. */
  fallback?: boolean;
  /** Adds `alternates`, the URL of each published locale. */
  alternates?: boolean;
  /** Adds `permalink`, the public URL in the read's locale. */
  permalink?: boolean;
};
/** Options of `publish` and `publishGlobal`. */
type PublishOptions = { locale?: string } & ConflictOptions;
/** Options of `unpublish` and `unpublishGlobal`. */
type UnpublishOptions = { locale?: string } & ConflictOptions;
/** Options of `discard` and `discardGlobal`. */
type DiscardOptions = { locale?: string } & DeleteOptions & {
    /** Drops the shared draft and the draft of every locale. Ignores `locale`. */
    all?: boolean;
  };
type Row = Record<string, any>;

/** Options of `create`, `update` and `setGlobal`. */
export type WriteOptions = {
  /** Saves a draft: the published data stays. Types are checked, but not `required`, the built-in checks, `validate`, `unique` or ids. */
  draft?: boolean;
  /** The locale to write. Default: the default locale. Unlocalized collections ignore it. */
  locale?: string;
};

/** The local API with untyped names and data, as hooks get it. */
export type LocalApi = {
  /** Server-side delivery with the configured adapter. Sends immediately. */
  email: EmailApi;
  find(collection: string, options?: Options): Promise<Row[]>;
  findOne(collection: string, options: Options): Promise<Row | undefined>;
  findById(collection: string, id: string, options?: Options): Promise<Row | undefined>;
  create(collection: string, data: Record<string, unknown>, options?: WriteOptions): Promise<Row>;
  update(
    collection: string,
    id: string,
    data: Record<string, unknown>,
    options?: WriteOptions & ConflictOptions,
  ): Promise<Row | undefined>;
  delete(collection: string, id: string, options?: DeleteOptions): Promise<void>;
  publish(collection: string, id: string, options?: PublishOptions): Promise<Row | undefined>;
  /** Takes a document off the published perspective. A draft stays, or the published data becomes the draft. */
  unpublish(collection: string, id: string, options?: UnpublishOptions): Promise<Row | undefined>;
  /** Queues a publish or an unpublish of a document for a later time. Needs `schedule: true` on the collection. Returns `undefined` if the document does not exist. */
  schedule(
    collection: string,
    id: string,
    options: ScheduleOptions,
  ): Promise<{ id: string } | undefined>;
  discard(collection: string, id: string, options?: DiscardOptions): Promise<Row | undefined>;
  /** Fills the localized fields of `to` with those of `from`, as a draft. Replaces the pending draft of `to`. */
  copyLocale(
    collection: string,
    id: string,
    locales: { from: string; to: string },
  ): Promise<Row | undefined>;
  /** Deletes the translation of one locale. The default locale and the last locale row stay. */
  removeLocale(collection: string, id: string, locale: string): Promise<Row | undefined>;
  /** Sets whether a document uses one structure in every locale. With `dryRun`, returns the counts per locale. */
  setSyncStructure(
    collection: string,
    id: string,
    sync: SyncChoice,
    options?: SyncStructureOptions,
  ): Promise<Row | StructureCounts | undefined>;
  /** Makes every document of a collection follow it. */
  applySyncStructure(collection: string, options?: { dryRun?: boolean }): Promise<AppliedStructure>;
  /**
   * The `alternates` of the document whose `permalink` is `url`, or `null` when no document has it. `url` is a public
   * path with the locale prefix of `routing`; its locale is read from the prefix, or from `options.locale`. Only a
   * `permalink` template of top-level fields (`/posts/{slug}`) can be matched.
   */
  alternatesAt(url: string, options?: { locale?: string }): Promise<Record<string, string> | null>;
  getGlobal(name: string, options?: Options): Promise<Row>;
  setGlobal(
    name: string,
    data: Record<string, unknown>,
    options?: WriteOptions & ConflictOptions,
  ): Promise<Row>;
  publishGlobal(name: string, options?: PublishOptions): Promise<Row>;
  unpublishGlobal(name: string, options?: UnpublishOptions): Promise<Row>;
  /** Queues a publish or an unpublish of a global for a later time. Needs `schedule: true` on the global. */
  scheduleGlobal(name: string, options: ScheduleOptions): Promise<{ id: string }>;
  discardGlobal(name: string, options?: DiscardOptions): Promise<Row>;
  copyGlobalLocale(name: string, locales: { from: string; to: string }): Promise<Row>;
  removeGlobalLocale(name: string, locale: string): Promise<Row>;
  setGlobalSyncStructure(
    name: string,
    sync: SyncChoice,
    options?: SyncStructureOptions,
  ): Promise<Row | StructureCounts | undefined>;
  /** Returns a copy of this API whose reads use the drafts perspective: unpublished documents and pending drafts. */
  withDrafts(): LocalApi;
  /** The job queue. Inside a hook, a queued job joins the write's transaction. */
  jobs: JobsApi;
  /** The media library. Missing without `defineCms({ media })`. */
  media?: MediaApi;
};
