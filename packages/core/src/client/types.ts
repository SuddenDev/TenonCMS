import type {
  Checked,
  Data,
  Doc,
  Fields as FieldsOf,
  FilterKey,
  MediaRead,
  MediaUpdate,
  PopulateOf,
  Read,
  ReadDoc,
  ReadOptions,
  Schema,
  SelectOf,
} from "../schema/index.ts";

import type { Register } from "./index.ts";

// Fields as the HTTP API sends them: private fields optional.
// Untyped fields (the admin's) stay as they are. The recursion would not terminate.
type HttpFields<F> = string extends keyof F ? F : { [K in keyof F]: HttpField<F[K]> };

type HttpField<F> = F extends { private: true } ? Omit<HttpGroup<F>, "required"> : HttpGroup<F>;

type HttpGroup<F> = F extends { type: "group"; fields: infer G }
  ? Omit<F, "fields"> & { fields: Extract<HttpFields<G>, FieldsOf> }
  : F;

// `Extract` keeps the result assignable to `Fields`.
type Http<R> = string extends keyof R
  ? R
  : {
      [K in keyof R]: Omit<R[K], "fields"> & {
        fields: R[K] extends { fields: infer F } ? Extract<HttpFields<F>, FieldsOf> : never;
      };
    };

/** The collections of `C` as the HTTP API sends them: `private` fields are optional. Use them to type browser code; the client's read types build on them. */
/** What reads of a signed-in user see: `drafts` (unpublished changes) or `published` (what visitors see). */
export type Perspective = "drafts" | "published";

export type Collections<C extends { schema: Schema }> = Http<
  NonNullable<C["schema"]["collections"]>
>;

/** The globals of `C` as the HTTP API sends them: `private` fields are optional. */
export type Globals<C extends { schema: Schema }> = Http<NonNullable<C["schema"]["globals"]>>;

type Fields<
  C extends { schema: Schema },
  K extends keyof Collections<C>,
> = Collections<C>[K]["fields"];

type Depth<C> = C extends { populate: { depth: infer D extends number } } ? D : 2;

type ReadCollection<C extends { schema: Schema }, K extends keyof Collections<C>, O> = ReadDoc<
  Collections<C>,
  Fields<C, K>,
  PopulateOf<O, Depth<C>>,
  SelectOf<O>
>;

/** Options of `find` and `findOne` for collection `K`. */
export type FindOptions<C extends { schema: Schema }, K extends keyof Collections<C>> = ReadOptions<
  Collections<C>,
  Fields<C, K>
> & {
  /** Equality filters on field values. `null` matches an empty or missing field. `undefined` adds no filter. */
  where?: Partial<Record<FilterKey<Fields<C, K>>, string | number | boolean | null>>;
  /** Maximum number of documents. */
  limit?: number;
};

/** The registered `cms` type, or an untyped schema without a registration. */
export type RegisteredCms = Register extends { cms: infer C extends { schema: Schema } }
  ? C
  : { schema: Schema };

export type ClientOptions = {
  /** Origin of the host app, e.g. `https://example.com`. Defaults to the current origin. */
  baseUrl?: string;
  /** Custom `fetch`, e.g. one that forwards cookies. Defaults to the global `fetch`. */
  fetch?: typeof fetch;
};

/** The signed-in admin, as returned by `getSession()`. Dates are ISO strings. */
export type Session = {
  user: {
    id: string;
    name: string;
    email: string;
    emailVerified: boolean;
    image?: string | null;
    createdAt: string;
    updatedAt: string;
  };
  session: { id: string; userId: string; expiresAt: string; createdAt: string; updatedAt: string };
};

type Global<C extends { schema: Schema }, K extends keyof Globals<C>> = Globals<C>[K]["fields"];

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

/** The media library over HTTP. Needs `defineCms({ media })`. Writes need a session. */
export type MediaClient = {
  /**
   * Uploads a file in parts, 4 at a time, retrying a failed part 3 times. Returns the media document.
   * `POST /api/cms/media/uploads`, then one `PUT` per part, then `POST /api/cms/media/uploads/:id/complete`.
   */
  upload(file: Blob & { name?: string }, options?: UploadOptions): Promise<MediaRead>;
  /**
   * Changes `alt`, or moves the file with a new `filename` or `folder`.
   * `PATCH /api/cms/media/:id`
   */
  update(id: string, data: MediaUpdate): Promise<MediaRead>;
  /**
   * Moves every file under `from` to `to`. `failed` lists files that did not move; call it again to finish.
   * `POST /api/cms/media/folders/rename`
   */
  renameFolder(
    from: string,
    to: string,
  ): Promise<{ moved: number; failed: { id: string; message: string }[] }>;
  /**
   * Deletes a file. Throws a `CmsError` with status `409` and `references` while a `restrict` field uses it.
   * `DELETE /api/cms/media/:id`
   */
  delete(id: string): Promise<null>;
  /**
   * Brings the stored variants of one file in line with the current image options. `force` re-renders all of them.
   * Throws a `CmsError` with status `404` for a missing file, or when the image provider stores no variants.
   * `POST /api/cms/media/:id/regenerate`
   */
  regenerate(
    id: string,
    options?: { force?: boolean },
  ): Promise<{ rendered: number; removed: number }>;
  /**
   * Lists every folder with its parents, sorted. The root is left out.
   * `GET /api/cms/media/folders`
   */
  folders(): Promise<string[]>;
};

/** The HTTP client. Names and document types come from `C`, the registered `cms`. See {@link Register}. */
export type Client<C extends { schema: Schema } = RegisteredCms> = {
  /**
   * Lists documents of a collection, newest first.
   * `GET /api/cms/collections/:collection`
   */
  find<K extends keyof Collections<C> & string, const O extends FindOptions<C, K> = {}>(
    collection: K,
    options?: Checked<O, Collections<C>, Fields<C, K>, Depth<C>>,
  ): Promise<ReadCollection<C, K, O>[]>;

  /** Returns the newest document that matches `where`, or `undefined`. */
  findOne<K extends keyof Collections<C> & string, const O extends FindOptions<C, K>>(
    collection: K,
    options: Checked<O, Collections<C>, Fields<C, K>, Depth<C>>,
  ): Promise<ReadCollection<C, K, O> | undefined>;

  /**
   * Returns one document. Throws a `CmsError` with status `404` if it does not exist.
   * `GET /api/cms/collections/:collection/:id`
   */
  findById<
    K extends keyof Collections<C> & string,
    const O extends ReadOptions<Collections<C>, Fields<C, K>> = {},
  >(
    collection: K,
    id: string,
    options?: Checked<O, Collections<C>, Fields<C, K>, Depth<C>>,
  ): Promise<ReadCollection<C, K, O>>;

  /**
   * Creates a document. Needs a session.
   * `POST /api/cms/collections/:collection`
   */
  create<K extends keyof Collections<C> & string>(
    collection: K,
    data: Data<Fields<C, K>>,
  ): Promise<Doc<Fields<C, K>>>;

  /**
   * Changes the top-level fields in `data`. Fields left out keep their stored values; `null` clears one. Needs a session.
   * `PUT /api/cms/collections/:collection/:id`
   */
  update<K extends keyof Collections<C> & string>(
    collection: K,
    id: string,
    data: Partial<Data<Fields<C, K>>>,
  ): Promise<Doc<Fields<C, K>>>;

  /**
   * Creates a document as an unpublished draft. Types are checked, `required` and the other checks wait for
   * `publish()`. Needs a session.
   * `POST /api/cms/collections/:collection/draft`
   */
  createDraft<K extends keyof Collections<C> & string>(
    collection: K,
    data: Partial<Data<Fields<C, K>>>,
  ): Promise<Doc<Fields<C, K>>>;

  /**
   * Changes the top-level fields of a document's draft, like `update()`. The published data stays. Needs a session.
   * `PUT /api/cms/collections/:collection/:id/draft`
   */
  updateDraft<K extends keyof Collections<C> & string>(
    collection: K,
    id: string,
    data: Partial<Data<Fields<C, K>>>,
  ): Promise<Doc<Fields<C, K>>>;

  /**
   * Publishes the draft of a document. Throws a `CmsError` with status `400` for invalid data and keeps the draft.
   * Needs a session.
   * `POST /api/cms/collections/:collection/:id/publish`
   */
  publish<K extends keyof Collections<C> & string>(
    collection: K,
    id: string,
  ): Promise<Doc<Fields<C, K>>>;

  /**
   * Drops the draft of a document and returns the published one. A document that was never published is deleted and
   * the result is `null`. Needs a session.
   * `DELETE /api/cms/collections/:collection/:id/draft`
   */
  discard<K extends keyof Collections<C> & string>(
    collection: K,
    id: string,
  ): Promise<Doc<Fields<C, K>> | null>;

  /**
   * Deletes a document. Needs a session.
   * `DELETE /api/cms/collections/:collection/:id`
   */
  delete(collection: keyof Collections<C> & string, id: string): Promise<null>;

  /**
   * Returns a global. Fields that were never saved are missing.
   * `GET /api/cms/globals/:name`
   */
  getGlobal<
    K extends keyof Globals<C> & string,
    const O extends ReadOptions<Collections<C>, Global<C, K>, false> = {},
  >(
    name: K,
    options?: Checked<O, Collections<C>, Global<C, K>, Depth<C>, false>,
  ): Promise<Partial<Read<Collections<C>, Global<C, K>, PopulateOf<O, Depth<C>>, SelectOf<O>>>>;

  /**
   * Changes the top-level fields in `data`. Fields left out keep their stored values; `null` clears one. Needs a session.
   * `PUT /api/cms/globals/:name`
   */
  setGlobal<K extends keyof Globals<C> & string>(
    name: K,
    data: Partial<Data<Global<C, K>>>,
  ): Promise<Data<Global<C, K>>>;

  /**
   * Changes the top-level fields of a global's draft. The published data stays. Needs a session.
   * `PUT /api/cms/globals/:name/draft`
   */
  setGlobalDraft<K extends keyof Globals<C> & string>(
    name: K,
    data: Partial<Data<Global<C, K>>>,
  ): Promise<Partial<Data<Global<C, K>>>>;

  /**
   * Publishes the draft of a global. Throws a `CmsError` with status `400` for invalid data. Needs a session.
   * `POST /api/cms/globals/:name/publish`
   */
  publishGlobal<K extends keyof Globals<C> & string>(name: K): Promise<Data<Global<C, K>>>;

  /**
   * Drops the draft of a global and returns the published one. Needs a session.
   * `DELETE /api/cms/globals/:name/draft`
   */
  discardGlobal<K extends keyof Globals<C> & string>(name: K): Promise<Partial<Data<Global<C, K>>>>;

  /**
   * The live preview URL of a document from its unsaved form state, relative to the site origin. `null`: no preview
   * for this document. Throws a `CmsError` with status `404` when the collection has no `preview`. Needs a session.
   * `POST /api/cms/collections/:collection/preview-url`
   */
  previewUrl(
    collection: keyof Collections<C> & string,
    data: Record<string, unknown>,
  ): Promise<string | null>;

  /**
   * The live preview URL of a global from its unsaved form state. Like {@link Client.previewUrl}.
   * `POST /api/cms/globals/:name/preview-url`
   */
  previewGlobalUrl(
    name: keyof Globals<C> & string,
    data: Record<string, unknown>,
  ): Promise<string | null>;

  /**
   * Returns the collections and globals with their fields. Needs a session.
   * `GET /api/cms/schema`
   */
  getSchema(): Promise<{
    collections?: Collections<C>;
    globals?: Globals<C>;
    /** Set when the media library is on. `regenerate`: the image provider stores variants, see `media.regenerate()`. */
    media?: { regenerate: boolean };
    /** The `site` option: the base of preview URLs. */
    site?: string;
  }>;

  /**
   * Creates the first admin and signs them in. Throws a `CmsError` with status `403` once an admin exists.
   * `POST /api/cms/auth/sign-up/email`
   */
  signUp(data: { name: string; email: string; password: string }): Promise<Session["user"]>;

  /**
   * Signs in and sets the session cookie. Throws a `CmsError` with status `401` for a wrong email or password.
   * `POST /api/cms/auth/sign-in/email`
   */
  signIn(data: { email: string; password: string }): Promise<Session["user"]>;

  /**
   * Signs out and clears the session cookie.
   * `POST /api/cms/auth/sign-out`
   */
  signOut(): Promise<void>;

  /**
   * Returns the signed-in admin, or `null` without a session.
   * `GET /api/cms/auth/get-session`
   * @example
   * const { user } = (await client.getSession()) ?? {}
   * user?.name
   */
  getSession(): Promise<Session | null>;

  /**
   * Calls any route under `/api/cms`, e.g. a plugin's. `body` is sent as JSON, `query` as the query string.
   * Throws a `CmsError` for an error status.
   * @example
   * await client.request<{ count: number }>('/redirects/lookup', { query: { path } })
   * await client.request('/redirects/import', { method: 'POST', body: rows })
   */
  request<T = unknown>(
    path: `/${string}`,
    options?: { method?: string; body?: unknown; query?: object },
  ): Promise<T>;

  /** The media library. See {@link MediaClient}. */
  media: MediaClient;

  /**
   * The preview cookie. It holds a {@link Perspective}. While it is `drafts`, reads of the signed-in user see drafts,
   * also on the site's pages. Both need a session.
   */
  preview: {
    /** Sets the cookie to `perspective`, default `drafts`. `POST /api/cms/preview` */
    enter(perspective?: Perspective): Promise<void>;
    /** Clears the cookie. `DELETE /api/cms/preview` */
    exit(): Promise<void>;
  };
};
