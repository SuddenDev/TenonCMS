import type { Fn, HookArgs, Slot } from "./index.ts";

/** A document of the media library as stored. Reads add `url`, and for images `src` and `srcset`. */
export type MediaDoc = {
  id: string;
  createdAt: string;
  updatedAt: string;
  /** Folder path, `''` at the root, e.g. `blog/2026`. */
  folder: string;
  /** Unique within its folder, case-insensitive. */
  filename: string;
  /** Storage key: `folder/filename`, or `filename` at the root. */
  key: string;
  mimeType: string;
  /** Size in bytes, measured by core. */
  size: number;
  /** Images only, read from the file header. */
  width?: number;
  /** Images only, read from the file header. */
  height?: number;
  alt?: string | null;
};

/** A media document as the media API returns it. */
export type MediaRead = MediaDoc & {
  /** URL of the original. */
  url: string;
  /** Images: URL of the default variant. */
  src?: string;
  /** Images: variants for `<img srcset>`. */
  srcset?: string;
};

/** What an upload declares before any bytes arrive. */
export type UploadInfo = { folder: string; filename: string; mimeType: string; size: number };

/** Fields of a media document that `cms.media.update()` changes. A new `filename` or `folder` moves the file. */
export type MediaUpdate = { alt?: string | null; filename?: string; folder?: string };

/** The media library in the local API: `cms.media`. Exists when `defineCms({ media })` is set. */
export type MediaApi = {
  /**
   * Uploads a file through the same steps as the admin, without HTTP. `size` is required for a stream.
   * Returns the media document. Throws a `ValidationError` for a file the options reject.
   */
  upload(
    data: Uint8Array | ReadableStream<Uint8Array>,
    info: { filename: string; mimeType: string; folder?: string; size?: number },
  ): Promise<MediaRead>;
  /**
   * Changes `alt`, or moves the file with a new `filename` or `folder`. A move never renames on a collision: a taken name is a
   * `ValidationError` with `Already used`. Returns `undefined` for a missing document.
   */
  update(id: string, data: MediaUpdate): Promise<MediaRead | undefined>;
  /** Moves every file under `from` to `to`, one by one. Running it again finishes a partial rename. */
  renameFolder(
    from: string,
    to: string,
  ): Promise<{ moved: number; failed: { id: string; message: string }[] }>;
  /** Deletes the document with the usual `onDelete` rules, then the file and its variants. */
  delete(id: string): Promise<void>;
  /**
   * Brings stored variants in line with the current image options: deletes the ones the options no longer produce and, with
   * `prerender`, renders missing ones. `force` re-renders every variant (without `prerender`: deletes them all, so they
   * render again on request). Without `id`, runs for every file and deletes variants of files that no longer exist.
   * Returns `undefined` for a missing document. Throws when the image provider has no `render`, because nothing is stored.
   */
  regenerate(
    id?: string,
    options?: { force?: boolean },
  ): Promise<{ rendered: number; removed: number } | undefined>;
};

type Args<E> = HookArgs & E;

/**
 * Hooks of the media library, in `media.hooks` and on plugins as `mediaHooks`. The host's run first, then each plugin's
 * in `plugins` order. They run inside the operation's transaction, except `afterDelete`.
 * Collection and root hooks do not run for `media`.
 */
export type MediaHooks = {
  /** Runs before any bytes arrive. MAY return changed `folder` or `filename`. Throw to reject the upload. */
  beforeUpload?: Slot<Fn<Args<{ data: UploadInfo }>, UploadInfo>>;
  /**
   * Runs once the file is stored and its document created. `read()` streams the file; with S3 it costs a GET.
   * Throw to delete the document and the file. Use `cms.media.update()` to change the document.
   */
  afterUpload?: Slot<
    Fn<Args<{ doc: MediaDoc; read(): Promise<ReadableStream<Uint8Array>> }>, void>
  >;
  /** Runs before an `alt` change. MAY return changed data. */
  beforeChange?: Slot<Fn<Args<{ data: MediaUpdate; originalDoc: MediaDoc }>, MediaUpdate>>;
  /** Runs after an `alt` change. */
  afterChange?: Slot<Fn<Args<{ doc: MediaDoc; previousDoc: MediaDoc }>, void>>;
  /** Runs before a file moves. `from` and `to` are storage keys. Throw to block the move. */
  beforeMove?: Slot<Fn<Args<{ doc: MediaDoc; from: string; to: string }>, void>>;
  /** Runs after a file moved, e.g. to purge a CDN. */
  afterMove?: Slot<Fn<Args<{ doc: MediaDoc; from: string; to: string }>, void>>;
  /** Runs before a delete. Throw to block it. */
  beforeDelete?: Slot<Fn<Args<{ doc: MediaDoc }>, void>>;
  /** Runs after the document and the file are deleted, outside the transaction. */
  afterDelete?: Slot<Fn<Args<{ doc: MediaDoc }>, void>>;
};
