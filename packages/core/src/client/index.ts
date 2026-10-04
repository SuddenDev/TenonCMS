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

export type { Checked, ReadOptions } from "../schema/index.ts";

// Helpers have no imports, so this file stays safe in the browser.
export {
  type BreadcrumbsOptions,
  breadcrumbs,
  SLUG_PATTERN,
  seoMeta,
  slugify,
} from "../helpers/index.ts";

/** Path of the HTTP API. */
export const API_BASE = "/api/cms";

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

// For `populate` and `select`: `{ author: { avatar: true } }` becomes `author.avatar`. An empty object ends a path too.
function paths(spec: object, prefix = ""): string[] {
  return Object.entries(spec).flatMap(([key, value]) =>
    value === true || (value && typeof value === "object" && !Object.keys(value).length)
      ? [prefix + key]
      : value && typeof value === "object"
        ? paths(value, `${prefix}${key}.`)
        : [],
  );
}

// `select: {}` is sent as an empty `select=`, which returns only `id`. A populate object with no paths means ids.
function readQuery({
  populate,
  depth,
  select,
}: {
  populate?: boolean | object;
  depth?: number;
  select?: object;
}) {
  const query: Record<string, string | number | undefined> = { depth };
  if (populate === false) query.populate = "false";
  else if (typeof populate === "object") query.populate = paths(populate).join(",") || "false";
  if (select) query.select = paths(select).join(",");
  return query;
}

/**
 * Holds the host's `cms` type, so `createClient()` is typed without a type argument.
 * The Astro and Nuxt adapters fill it in. Elsewhere, map `#integral/config` to your config file and
 * load `integral-cms/register` in `tsconfig.json`:
 * @example
 * "paths": { "#integral/config": ["./integral.config.ts"] },
 * "types": ["integral-cms/register"]
 */
export interface Register {}

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

/** Thrown by client methods when the API answers with a non-2xx status. */
export class CmsError extends Error {
  constructor(
    /** HTTP status, e.g. `401` without a session or `400` for invalid data. */
    public status: number,
    /**
     * Parsed response body, if any. It has `message`. A `400` for invalid data also has `errors`: messages by field path.
     * A `409` for a blocked delete has `references`: the documents that point to it.
     */
    public body: any,
  ) {
    super(body?.message ?? `Request failed (${status})`);
  }
}

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

type ReadQuery = { populate?: boolean | object; depth?: number; select?: object };

type FindQuery = ReadQuery & { where?: object; limit?: number };

/**
 * Typed HTTP client for `/api/cms`. It has the same methods as the local API, so code reads the same on
 * both sides. Use it in the browser: admin pages, islands, client components. On the server, call the
 * `cms` instance directly.
 *
 * Reads are public. Writes need an admin session cookie, so they work in admin pages.
 *
 * Collection and global names and document types come from the registered `cms`. See {@link Register}.
 * Pass a type argument to override it.
 * @example
 * import { createClient } from 'integral-cms/client'
 *
 * const client = createClient()
 * const posts = await client.find('posts', { where: { featured: true } })
 */
export function createClient<C extends { schema: Schema } = RegisteredCms>({
  baseUrl = "",
  fetch: fetchFn = fetch,
}: ClientOptions = {}): Client<C> {
  async function request(method: string, path: string, body?: unknown, query?: object) {
    const params = new URLSearchParams(
      Object.entries(query ?? {}).flatMap(([key, value]) =>
        value === undefined ? [] : [[key, String(value)]],
      ),
    );
    const search = params.size ? `?${params}` : "";
    const res = await fetchFn(`${baseUrl}${API_BASE}${path}${search}`, {
      method,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = res.status === 204 ? null : await res.json().catch(() => null);
    if (!res.ok) throw new CmsError(res.status, data);
    return data;
  }

  const enc = encodeURIComponent;
  const collection = (name: string) => `/collections/${enc(name)}`;
  const doc = (name: string, id: string) => `${collection(name)}/${enc(id)}`;
  const global = (name: string) => `/globals/${enc(name)}`;
  const user = async (path: string, data: object) => (await request("POST", path, data)).user;

  // The implementation is untyped; `Client` types it for the host.
  const client = {
    find: (name: string, { where, limit, ...read }: FindQuery = {}) =>
      request("GET", collection(name), undefined, {
        ...where,
        ...(limit && { limit }),
        ...readQuery(read),
      }),

    findOne: async (name: string, options: FindQuery) =>
      (await client.find(name, { ...options, limit: 1 }))[0],

    findById: (name: string, id: string, options: ReadQuery = {}) =>
      request("GET", doc(name, id), undefined, readQuery(options)),

    create: (name: string, data: unknown) => request("POST", collection(name), data),

    update: (name: string, id: string, data: unknown) => request("PUT", doc(name, id), data),

    createDraft: (name: string, data: unknown) =>
      request("POST", `${collection(name)}/draft`, data),

    updateDraft: (name: string, id: string, data: unknown) =>
      request("PUT", `${doc(name, id)}/draft`, data),

    publish: (name: string, id: string) => request("POST", `${doc(name, id)}/publish`),

    discard: (name: string, id: string) => request("DELETE", `${doc(name, id)}/draft`),

    delete: (name: string, id: string) => request("DELETE", doc(name, id)),

    getGlobal: (name: string, options: ReadQuery = {}) =>
      request("GET", global(name), undefined, readQuery(options)),

    setGlobal: (name: string, data: unknown) => request("PUT", global(name), data),

    setGlobalDraft: (name: string, data: unknown) => request("PUT", `${global(name)}/draft`, data),

    publishGlobal: (name: string) => request("POST", `${global(name)}/publish`),

    discardGlobal: (name: string) => request("DELETE", `${global(name)}/draft`),

    previewUrl: async (name: string, data: unknown) =>
      (await request("POST", `${collection(name)}/preview-url`, data)).url,

    previewGlobalUrl: async (name: string, data: unknown) =>
      (await request("POST", `${global(name)}/preview-url`, data)).url,

    getSchema: () => request("GET", "/schema"),

    signUp: (data: object) => user("/auth/sign-up/email", data),

    signIn: (data: object) => user("/auth/sign-in/email", data),

    signOut: async () => {
      await request("POST", "/auth/sign-out", {});
    },

    getSession: () => request("GET", "/auth/get-session"),

    request: (
      path: string,
      { method = "GET", body, query } = {} as NonNullable<Parameters<Client["request"]>[1]>,
    ) => request(method, path, body, query),

    media: {
      upload,
      update: (id: string, data: unknown) => request("PATCH", `/media/${enc(id)}`, data),
      renameFolder: (from: string, to: string) =>
        request("POST", "/media/folders/rename", { from, to }),
      delete: (id: string) => request("DELETE", `/media/${enc(id)}`),
      regenerate: (id: string, options: { force?: boolean } = {}) =>
        request("POST", `/media/${enc(id)}/regenerate`, options),
      folders: () => request("GET", "/media/folders"),
    },

    preview: {
      enter: async (perspective: Perspective = "drafts") => {
        await request("POST", "/preview", { perspective });
      },
      exit: async () => {
        await request("DELETE", "/preview");
      },
    },
  };

  // Sends one part. Proxied parts answer `{ etag }`; direct ones (S3) send the `ETag` header.
  // A 4xx other than 408 and 429 is final; anything else is retried 3 times with backoff.
  async function putPart(url: string, blob: Blob, signal?: AbortSignal) {
    for (let attempt = 0; ; attempt++) {
      signal?.throwIfAborted();
      const res = await fetchFn(url.startsWith("/") ? `${baseUrl}${url}` : url, {
        method: "PUT",
        body: blob,
        signal,
      }).catch((error) => {
        if (signal?.aborted || attempt >= 3) throw error;
      });
      if (res?.ok)
        return url.startsWith("/") ? (await res.json()).etag : (res.headers.get("etag") ?? "");
      const final = res && res.status < 500 && res.status !== 408 && res.status !== 429;
      if (res && (final || attempt >= 3))
        throw new CmsError(res.status, await res.json().catch(() => null));
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
    }
  }

  async function upload(
    file: Blob & { name?: string },
    { folder, filename, onProgress, signal }: UploadOptions = {},
  ) {
    signal?.throwIfAborted();
    const plan = await request("POST", "/media/uploads", {
      folder,
      filename: filename ?? file.name ?? "file",
      mimeType: file.type || "application/octet-stream",
      size: file.size,
    });
    const id = `/media/uploads/${enc(plan.id)}`;
    try {
      const queue = [...plan.parts] as { n: number; url: string }[];
      const parts: { n: number; etag: string }[] = [];
      let loaded = 0;
      const worker = async () => {
        for (let part = queue.shift(); part; part = queue.shift()) {
          const blob = file.slice((part.n - 1) * plan.partSize, part.n * plan.partSize);
          parts.push({ n: part.n, etag: await putPart(part.url, blob, signal) });
          loaded += blob.size;
          onProgress?.({ loaded, total: file.size });
        }
      };
      await Promise.all([1, 2, 3, 4].map(worker));
      signal?.throwIfAborted();
      return await request("POST", `${id}/complete`, { parts });
    } catch (error) {
      await request("DELETE", id).catch(() => {});
      throw error;
    }
  }

  return client as unknown as Client<C>;
}
