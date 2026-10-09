import type { AdminDescriptor } from "../../admin/index.d.ts";
import type {
  Checked,
  Data,
  Doc,
  Read,
  ReadOptions,
  Schema,
  SelectOf,
  PopulateOf,
} from "../../schema/index.ts";
import type { MediaClient } from "./media.ts";
import type { FindOptions } from "./options.ts";
import type {
  CollectionFields,
  Collections,
  Depth,
  GlobalFields,
  Globals,
  ReadCollection,
  RegisteredCms,
} from "./schema.ts";

/** What reads of a signed-in user see: `drafts` (unpublished changes) or `published` (what visitors see). */
export type Perspective = "drafts" | "published";

/** The signed-in admin, as returned by `getSession()`. Dates are ISO strings. */
export type Session = {
  /** The signed-in admin. */
  user: {
    id: string;
    name: string;
    email: string;
    emailVerified: boolean;
    /** Avatar URL. */
    image?: string | null;
    createdAt: string;
    updatedAt: string;
  };
  /** The session behind the cookie. */
  session: { id: string; userId: string; expiresAt: string; createdAt: string; updatedAt: string };
};

/** The HTTP client. Names and document types come from `C`, the registered `cms`. See {@link RegisteredCms}. */
export type Client<C extends { schema: Schema } = RegisteredCms> = {
  /**
   * Lists documents of a collection, newest first.
   * `GET /api/cms/collections/:collection`
   */
  find<K extends keyof Collections<C> & string, const O extends FindOptions<C, K> = {}>(
    collection: K,
    options?: Checked<O, Collections<C>, CollectionFields<C, K>, Depth<C>>,
  ): Promise<ReadCollection<C, K, O>[]>;

  /** Returns the newest document that matches `where`, or `undefined`. */
  findOne<K extends keyof Collections<C> & string, const O extends FindOptions<C, K>>(
    collection: K,
    options: Checked<O, Collections<C>, CollectionFields<C, K>, Depth<C>>,
  ): Promise<ReadCollection<C, K, O> | undefined>;

  /**
   * Returns one document. Throws a `CmsError` with status `404` if it does not exist.
   * `GET /api/cms/collections/:collection/:id`
   */
  findById<
    K extends keyof Collections<C> & string,
    const O extends ReadOptions<Collections<C>, CollectionFields<C, K>> = {},
  >(
    collection: K,
    id: string,
    options?: Checked<O, Collections<C>, CollectionFields<C, K>, Depth<C>>,
  ): Promise<ReadCollection<C, K, O>>;

  /**
   * Creates a document. Needs a session.
   * `POST /api/cms/collections/:collection`
   */
  create<K extends keyof Collections<C> & string>(
    collection: K,
    data: Data<CollectionFields<C, K>>,
  ): Promise<Doc<CollectionFields<C, K>>>;

  /**
   * Changes the top-level fields in `data`. Fields left out keep their stored values; `null` clears one. Needs a session.
   * `PUT /api/cms/collections/:collection/:id`
   */
  update<K extends keyof Collections<C> & string>(
    collection: K,
    id: string,
    data: Partial<Data<CollectionFields<C, K>>>,
  ): Promise<Doc<CollectionFields<C, K>>>;

  /**
   * Creates a document as an unpublished draft. Types are checked, `required` and the other checks wait for
   * `publish()`. Needs a session.
   * `POST /api/cms/collections/:collection/draft`
   */
  createDraft<K extends keyof Collections<C> & string>(
    collection: K,
    data: Partial<Data<CollectionFields<C, K>>>,
  ): Promise<Doc<CollectionFields<C, K>>>;

  /**
   * Changes the top-level fields of a document's draft, like `update()`. The published data stays. Needs a session.
   * `PUT /api/cms/collections/:collection/:id/draft`
   */
  updateDraft<K extends keyof Collections<C> & string>(
    collection: K,
    id: string,
    data: Partial<Data<CollectionFields<C, K>>>,
  ): Promise<Doc<CollectionFields<C, K>>>;

  /**
   * Publishes the draft of a document. Throws a `CmsError` with status `400` for invalid data and keeps the draft.
   * Needs a session.
   * `POST /api/cms/collections/:collection/:id/publish`
   */
  publish<K extends keyof Collections<C> & string>(
    collection: K,
    id: string,
  ): Promise<Doc<CollectionFields<C, K>>>;

  /**
   * Drops the draft of a document and returns the published one. A document that was never published is deleted and
   * the result is `null`. Needs a session.
   * `DELETE /api/cms/collections/:collection/:id/draft`
   */
  discard<K extends keyof Collections<C> & string>(
    collection: K,
    id: string,
  ): Promise<Doc<CollectionFields<C, K>> | null>;

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
    const O extends ReadOptions<Collections<C>, GlobalFields<C, K>, false> = {},
  >(
    name: K,
    options?: Checked<O, Collections<C>, GlobalFields<C, K>, Depth<C>, false>,
  ): Promise<
    Partial<Read<Collections<C>, GlobalFields<C, K>, PopulateOf<O, Depth<C>>, SelectOf<O>>>
  >;

  /**
   * Changes the top-level fields in `data`. Fields left out keep their stored values; `null` clears one. Needs a session.
   * `PUT /api/cms/globals/:name`
   */
  setGlobal<K extends keyof Globals<C> & string>(
    name: K,
    data: Partial<Data<GlobalFields<C, K>>>,
  ): Promise<Data<GlobalFields<C, K>>>;

  /**
   * Changes the top-level fields of a global's draft. The published data stays. Needs a session.
   * `PUT /api/cms/globals/:name/draft`
   */
  setGlobalDraft<K extends keyof Globals<C> & string>(
    name: K,
    data: Partial<Data<GlobalFields<C, K>>>,
  ): Promise<Partial<Data<GlobalFields<C, K>>>>;

  /**
   * Publishes the draft of a global. Throws a `CmsError` with status `400` for invalid data. Needs a session.
   * `POST /api/cms/globals/:name/publish`
   */
  publishGlobal<K extends keyof Globals<C> & string>(name: K): Promise<Data<GlobalFields<C, K>>>;

  /**
   * Drops the draft of a global and returns the published one. Needs a session.
   * `DELETE /api/cms/globals/:name/draft`
   */
  discardGlobal<K extends keyof Globals<C> & string>(
    name: K,
  ): Promise<Partial<Data<GlobalFields<C, K>>>>;

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
    /** Collections by name. */
    collections?: Collections<C>;
    /** Globals by name. */
    globals?: Globals<C>;
    /** Set when the media library is on. `regenerate`: the image provider stores variants, see `media.regenerate()`. */
    media?: { regenerate: boolean };
    /** The `site` option: the base of preview URLs. */
    site?: string;
    admin?: AdminDescriptor;
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
    options?: {
      /** HTTP method. Default: `GET`. */
      method?: string;
      /** Sent as JSON. */
      body?: unknown;
      /** Sent as the query string. `undefined` values are left out. */
      query?: object;
    },
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
