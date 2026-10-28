import type { RichtextDocument, RichtextTargets } from "../../richtext/config/types.ts";
import type { DeleteOptions } from "../../errors.ts";
import type { AdminDescriptor, Text } from "../../admin/index.d.ts";
import type { Localization } from "../../cms/config/options.ts";
import type {
  Checked,
  Data,
  Doc,
  GlobalLocaleMeta,
  Locale,
  Read,
  ReadOptions,
  Schema,
  SelectOf,
  PopulateOf,
} from "../../schema/index.ts";
import type { Invite, InviteResult } from "../../users/types.ts";
import type { ApiKey, ApiKeyPermissions, NewApiKey } from "../../api-keys/types.ts";
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
    /** Admin language, `en` or `de`. `null` follows the browser. */
    language?: string | null;
    /** IANA time zone the admin shows dates in. `null` follows the device. */
    timezone?: string | null;
    /** `admin`, `editor` or a host role. `null` counts as `editor`. */
    role?: string | null;
    createdAt: string;
    updatedAt: string;
  };
  /** The session behind the cookie. */
  session: { id: string; userId: string; expiresAt: string; createdAt: string; updatedAt: string };
};

/** Options of a write, and of `publish()` and `discard()`: the locale they act on. */
export type LocaleOption<C> = {
  /** The locale to write. Default: the default locale. Collections and globals that are not `localized` ignore it. */
  locale?: Locale<C>;
};

/** Options of `discard()` and `discardGlobal()`: one locale's draft, or every draft with `all`. */
export type DiscardOption<C> =
  | (LocaleOption<C> & DeleteOptions)
  | {
      /** Drops the shared draft and the draft of every locale. A document or locale that was never published is deleted. Ignores `locale`. Sent as `?all=true`. */
      all: true;
      allowBrokenLinks?: boolean;
    };

/** The HTTP client. Names and document types come from `C`, the registered `cms`. See {@link RegisteredCms}. */
export type Client<C extends { schema: Schema } = RegisteredCms> = {
  /**
   * Lists documents of a collection, newest first.
   * `GET /api/cms/collections/:collection`
   */
  find<K extends keyof Collections<C> & string, const O extends FindOptions<C, K> = {}>(
    collection: K,
    options?: Checked<O, Collections<C>, CollectionFields<C, K>, Depth<C>, true, Locale<C>>,
  ): Promise<ReadCollection<C, K, O>[]>;

  /** Returns the newest document that matches `where`, or `undefined`. */
  findOne<K extends keyof Collections<C> & string, const O extends FindOptions<C, K>>(
    collection: K,
    options: Checked<O, Collections<C>, CollectionFields<C, K>, Depth<C>, true, Locale<C>>,
  ): Promise<ReadCollection<C, K, O> | undefined>;

  /**
   * Returns one document. Throws a `CmsError` with status `404` if it does not exist.
   * `GET /api/cms/collections/:collection/:id`
   */
  findById<
    K extends keyof Collections<C> & string,
    const O extends ReadOptions<Collections<C>, CollectionFields<C, K>, true, Locale<C>> = {},
  >(
    collection: K,
    id: string,
    options?: Checked<O, Collections<C>, CollectionFields<C, K>, Depth<C>, true, Locale<C>>,
  ): Promise<ReadCollection<C, K, O>>;

  /**
   * Creates a document. Needs a session.
   * `POST /api/cms/collections/:collection`
   */
  create<K extends keyof Collections<C> & string>(
    collection: K,
    data: Data<CollectionFields<C, K>>,
    options?: LocaleOption<C>,
  ): Promise<Doc<CollectionFields<C, K>>>;

  /**
   * Changes the top-level fields in `data`. Fields left out keep their stored values; `null` clears one. Needs a session.
   * `PUT /api/cms/collections/:collection/:id`
   */
  update<K extends keyof Collections<C> & string>(
    collection: K,
    id: string,
    data: Partial<Data<CollectionFields<C, K>>>,
    options?: LocaleOption<C>,
  ): Promise<Doc<CollectionFields<C, K>>>;

  /**
   * Creates a document as an unpublished draft. Types are checked, `required` and the other checks wait for
   * `publish()`. Needs a session.
   * `POST /api/cms/collections/:collection/draft`
   */
  createDraft<K extends keyof Collections<C> & string>(
    collection: K,
    data: Partial<Data<CollectionFields<C, K>>>,
    options?: LocaleOption<C>,
  ): Promise<Doc<CollectionFields<C, K>>>;

  /**
   * Changes the top-level fields of a document's draft, like `update()`. The published data stays. Needs a session.
   * `PUT /api/cms/collections/:collection/:id/draft`
   */
  updateDraft<K extends keyof Collections<C> & string>(
    collection: K,
    id: string,
    data: Partial<Data<CollectionFields<C, K>>>,
    options?: LocaleOption<C>,
  ): Promise<Doc<CollectionFields<C, K>>>;

  /**
   * Publishes the draft of a document. Throws a `CmsError` with status `400` for invalid data and keeps the draft.
   * Needs a session.
   * `POST /api/cms/collections/:collection/:id/publish`
   */
  publish<K extends keyof Collections<C> & string>(
    collection: K,
    id: string,
    options?: LocaleOption<C>,
  ): Promise<Doc<CollectionFields<C, K>>>;

  /**
   * Drops the draft of a document and returns the published one. A document that was never published is deleted and
   * the result is `null`. In a localized collection it drops the draft of one locale (`locale`); the shared draft
   * stays until a publish. `{ all: true }` drops every draft. Needs a session.
   * `DELETE /api/cms/collections/:collection/:id/draft`
   */
  discard<K extends keyof Collections<C> & string>(
    collection: K,
    id: string,
    options?: DiscardOption<C>,
  ): Promise<Doc<CollectionFields<C, K>> | null>;

  /**
   * Fills the localized fields of `to` with those of `from`, as a draft in `to` (straight to the data with
   * `drafts: false`). It replaces the pending draft of `to`. Throws a `CmsError` with status `400` for an unknown or
   * equal locale, or a collection that is not localized. Needs a session.
   * `POST /api/cms/collections/:collection/:id/locales/:to/copy`
   */
  copyLocale<K extends keyof Collections<C> & string>(
    collection: K,
    id: string,
    locales: { from: Locale<C>; to: Locale<C> },
  ): Promise<Doc<CollectionFields<C, K>>>;

  /**
   * Deletes the translation of one locale. Throws a `CmsError` with status `400` for the default locale and for the
   * document's last locale. Needs a session.
   * `DELETE /api/cms/collections/:collection/:id/locales/:locale`
   */
  removeLocale<K extends keyof Collections<C> & string>(
    collection: K,
    id: string,
    locale: Locale<C>,
  ): Promise<Doc<CollectionFields<C, K>>>;

  /**
   * Deletes a document. Needs a session.
   * `DELETE /api/cms/collections/:collection/:id`
   */
  delete(
    collection: keyof Collections<C> & string,
    id: string,
    options?: DeleteOptions,
  ): Promise<null>;

  /**
   * Returns a global. Fields that were never saved are missing.
   * `GET /api/cms/globals/:name`
   */
  getGlobal<
    K extends keyof Globals<C> & string,
    const O extends ReadOptions<Collections<C>, GlobalFields<C, K>, false, Locale<C>> = {},
  >(
    name: K,
    options?: Checked<O, Collections<C>, GlobalFields<C, K>, Depth<C>, false, Locale<C>>,
  ): Promise<
    Partial<Read<Collections<C>, GlobalFields<C, K>, PopulateOf<O, Depth<C>>, SelectOf<O>>> &
      GlobalLocaleMeta<Globals<C>[K], Locale<C>, SelectOf<O>>
  >;

  /**
   * Changes the top-level fields in `data`. Fields left out keep their stored values; `null` clears one. Needs a session.
   * `PUT /api/cms/globals/:name`
   */
  setGlobal<K extends keyof Globals<C> & string>(
    name: K,
    data: Partial<Data<GlobalFields<C, K>>>,
    options?: LocaleOption<C>,
  ): Promise<Data<GlobalFields<C, K>>>;

  /**
   * Changes the top-level fields of a global's draft. The published data stays. Needs a session.
   * `PUT /api/cms/globals/:name/draft`
   */
  setGlobalDraft<K extends keyof Globals<C> & string>(
    name: K,
    data: Partial<Data<GlobalFields<C, K>>>,
    options?: LocaleOption<C>,
  ): Promise<Partial<Data<GlobalFields<C, K>>>>;

  /**
   * Publishes the draft of a global. Throws a `CmsError` with status `400` for invalid data. Needs a session.
   * `POST /api/cms/globals/:name/publish`
   */
  publishGlobal<K extends keyof Globals<C> & string>(
    name: K,
    options?: LocaleOption<C>,
  ): Promise<Data<GlobalFields<C, K>>>;

  /**
   * Drops the draft of a global and returns the published one. Like {@link Client.discard}, it takes `locale` or
   * `{ all: true }`. Needs a session.
   * `DELETE /api/cms/globals/:name/draft`
   */
  discardGlobal<K extends keyof Globals<C> & string>(
    name: K,
    options?: DiscardOption<C>,
  ): Promise<Partial<Data<GlobalFields<C, K>>>>;

  /**
   * Fills the localized fields of `to` with those of `from`, like {@link Client.copyLocale}. Needs a session.
   * `POST /api/cms/globals/:name/locales/:to/copy`
   */
  copyGlobalLocale<K extends keyof Globals<C> & string>(
    name: K,
    locales: { from: Locale<C>; to: Locale<C> },
  ): Promise<Partial<Data<GlobalFields<C, K>>>>;

  /**
   * Deletes the translation of one locale, like {@link Client.removeLocale}. Needs a session.
   * `DELETE /api/cms/globals/:name/locales/:locale`
   */
  removeGlobalLocale<K extends keyof Globals<C> & string>(
    name: K,
    locale: Locale<C>,
  ): Promise<Partial<Data<GlobalFields<C, K>>>>;

  /**
   * The live preview URL of a document from its unsaved form state, relative to the site origin. `null`: no preview
   * for this document. Throws a `CmsError` with status `404` when the collection has neither `preview` nor `permalink`. Needs a session.
   * `POST /api/cms/collections/:collection/preview-url`
   */
  previewUrl(
    collection: keyof Collections<C> & string,
    data: Record<string, unknown>,
    options?: LocaleOption<C>,
  ): Promise<string | null>;

  /**
   * The live preview URL of a global from its unsaved form state. Like {@link Client.previewUrl}.
   * `POST /api/cms/globals/:name/preview-url`
   */
  previewGlobalUrl(
    name: keyof Globals<C> & string,
    data: Record<string, unknown>,
    options?: LocaleOption<C>,
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
   * The `localization` option with its defaults, or `null` without it. Public. The first call fetches it; the client
   * keeps the result, so later calls make no request.
   * `GET /api/cms/localization`
   */
  localization(): Promise<[Locale<C>] extends [never] ? null : Localization<Locale<C>> | null>;

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

  /** Sends a password-reset link when the account exists. Needs configured email delivery. `redirectTo` is the trusted URL of the new-password form. */
  requestPasswordReset(data: { email: string; redirectTo?: string }): Promise<void>;

  /** Sets a new password using the single-use token from the email link. Does not sign in. */
  resetPassword(data: { token: string; newPassword: string }): Promise<void>;

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

  /** Rich text links for the admin's editor. Both read in the perspective of the preview cookie, see `preview.enter()`. */
  richtext: {
    /** Fills the `href` and `src` of every link in an unsaved document. `POST /api/cms/admin/richtext/resolve` */
    resolve(document: RichtextDocument, options?: { locale?: string }): Promise<RichtextDocument>;
    /** Finds link targets by title. `GET /api/cms/admin/richtext/targets` */
    search(options?: { query?: string; locale?: string }): Promise<RichtextTargets>;
  };
  /** The media library. See {@link MediaClient}. */
  media: MediaClient;

  /** Invites to the admin. Listing, creating, resending and revoking need an admin's session. */
  invites: {
    /** Every invite, expired ones flagged. `GET /api/cms/invites` */
    list(): Promise<Invite[]>;
    /**
     * Invites `email` with `role`. `url` is the admin's invite page; it MUST be on the site's origin. A `CmsError` with
     * status `502` means sending failed: its `body` is the {@link InviteResult}, so the link can be sent by hand.
     * `POST /api/cms/invites`
     */
    create(data: { email: string; role: string; url: string }): Promise<InviteResult>;
    /** A new link, so the old one stops working, sent again. `POST /api/cms/invites/:id/resend` */
    resend(id: string, data: { url: string }): Promise<InviteResult>;
    /** `DELETE /api/cms/invites/:id` */
    revoke(id: string): Promise<void>;
    /** The email, role and role label of a valid token. Public. `POST /api/cms/invites/check` */
    check(token: string): Promise<{ email: string; role: string; label: Text }>;
    /** Creates the invited user and signs them in. Public. `POST /api/cms/invites/accept` */
    accept(data: { token: string; name: string; password: string }): Promise<{
      user: Session["user"];
    }>;
  };

  /** API keys. For admins only, with a session: a key cannot manage keys. */
  apiKeys: {
    /** Every key, revoked ones included. `GET /api/cms/api-keys` */
    list(): Promise<ApiKey[]>;
    /**
     * Creates a key with the grid `permissions`. Unknown targets and operations are a 400. `expiresIn` is in seconds,
     * between 1 and 365 days; without it the key does not expire. The result holds the key itself, which is never
     * shown again. `POST /api/cms/api-keys`
     */
    create(data: {
      name: string;
      permissions: ApiKeyPermissions;
      expiresIn?: number;
    }): Promise<NewApiKey>;
    /**
     * Gives a key a new secret. Its id, grid and expiry stay; the old secret stops at once. The result holds the new
     * secret, which is never shown again. A revoked key is a 404. `POST /api/cms/api-keys/:id/roll`
     */
    roll(id: string): Promise<NewApiKey>;
    /** Disables a key. It stays listed. `POST /api/cms/api-keys/:id/revoke` */
    revoke(id: string): Promise<void>;
    /** Deletes a key for good. `DELETE /api/cms/api-keys/:id` */
    delete(id: string): Promise<void>;
  };

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
