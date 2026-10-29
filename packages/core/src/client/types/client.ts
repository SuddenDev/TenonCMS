import type { RichtextDocument, RichtextTargets } from "../../richtext/config/types.ts";
import type { ConflictOptions, DeleteOptions } from "../../errors.ts";
import type { AdminDescriptor, Text } from "../../admin/index.d.ts";
import type { Localization } from "../../cms/config/options.ts";
import type {
  Checked,
  Data,
  Doc,
  GlobalLocaleMeta,
  GlobalMeta,
  Locale,
  Read,
  ReadOptions,
  Schema,
  SelectOf,
  PopulateOf,
} from "../../schema/index.ts";
import type { Invite, InviteResult } from "../../users/types.ts";
import type { ApiKey, ApiKeyPermissions, NewApiKey } from "../../api-keys/types.ts";
import type { Lock } from "../../locks/types.ts";
import type { Version, VersionWithData } from "../../versions/types.ts";
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
   * `GET /_tenon/collections/:collection`
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
   * `GET /_tenon/collections/:collection/:id`
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
   * `POST /_tenon/collections/:collection`
   */
  create<K extends keyof Collections<C> & string>(
    collection: K,
    data: Data<CollectionFields<C, K>>,
    options?: LocaleOption<C>,
  ): Promise<Doc<CollectionFields<C, K>>>;

  /**
   * Changes the top-level fields in `data`. Fields left out keep their stored values; `null` clears one. Needs a session.
   * `PUT /_tenon/collections/:collection/:id`
   */
  update<K extends keyof Collections<C> & string>(
    collection: K,
    id: string,
    data: Partial<Data<CollectionFields<C, K>>>,
    options?: LocaleOption<C> & ConflictOptions,
  ): Promise<Doc<CollectionFields<C, K>>>;

  /**
   * Creates a document as an unpublished draft. Types are checked, `required` and the other checks wait for
   * `publish()`. Needs a session.
   * `POST /_tenon/collections/:collection/draft`
   */
  createDraft<K extends keyof Collections<C> & string>(
    collection: K,
    data: Partial<Data<CollectionFields<C, K>>>,
    options?: LocaleOption<C>,
  ): Promise<Doc<CollectionFields<C, K>>>;

  /**
   * Changes the top-level fields of a document's draft, like `update()`. The published data stays. Needs a session.
   * `PUT /_tenon/collections/:collection/:id/draft`
   */
  updateDraft<K extends keyof Collections<C> & string>(
    collection: K,
    id: string,
    data: Partial<Data<CollectionFields<C, K>>>,
    options?: LocaleOption<C> & ConflictOptions,
  ): Promise<Doc<CollectionFields<C, K>>>;

  /**
   * Publishes the draft of a document. Throws a `CmsError` with status `400` for invalid data and keeps the draft.
   * Needs a session.
   * `POST /_tenon/collections/:collection/:id/publish`
   */
  publish<K extends keyof Collections<C> & string>(
    collection: K,
    id: string,
    options?: LocaleOption<C> & ConflictOptions,
  ): Promise<Doc<CollectionFields<C, K>>>;

  /**
   * Drops the draft of a document and returns the published one. A document that was never published is deleted and
   * the result is `null`. In a localized collection it drops the draft of one locale (`locale`); the shared draft
   * stays until a publish. `{ all: true }` drops every draft. Needs a session.
   * `DELETE /_tenon/collections/:collection/:id/draft`
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
   * `POST /_tenon/collections/:collection/:id/locales/:to/copy`
   */
  copyLocale<K extends keyof Collections<C> & string>(
    collection: K,
    id: string,
    locales: { from: Locale<C>; to: Locale<C> },
  ): Promise<Doc<CollectionFields<C, K>>>;

  /**
   * Deletes the translation of one locale. Throws a `CmsError` with status `400` for the default locale and for the
   * document's last locale. Needs a session.
   * `DELETE /_tenon/collections/:collection/:id/locales/:locale`
   */
  removeLocale<K extends keyof Collections<C> & string>(
    collection: K,
    id: string,
    locale: Locale<C>,
  ): Promise<Doc<CollectionFields<C, K>>>;

  /**
   * Claims or renews the caller's edit lock on a document. A lock someone else holds stays theirs and the answer
   * names them, unless `takeover` is set. A lock lasts `LOCK_TTL` without a renewal. Needs a session and the right to
   * update; an API key MAY NOT lock.
   * `POST /_tenon/collections/:collection/:id/lock`
   */
  lock(
    collection: keyof Collections<C> & string,
    id: string,
    options?: { takeover?: boolean },
  ): Promise<Lock>;

  /**
   * Frees the caller's edit lock on a document. Someone else's lock stays. Needs a session.
   * `DELETE /_tenon/collections/:collection/:id/lock`
   */
  unlock(collection: keyof Collections<C> & string, id: string): Promise<void>;

  /**
   * The versions of a document in one locale, newest first. Needs a session and the right to update.
   * `GET /_tenon/collections/:collection/:id/versions`
   */
  versions(
    collection: keyof Collections<C> & string,
    id: string,
    options?: LocaleOption<C>,
  ): Promise<Version[]>;

  /**
   * One version of a document with its data. Fields the caller MAY NOT read are left out.
   * `GET /_tenon/collections/:collection/:id/versions/:version`
   */
  version(
    collection: keyof Collections<C> & string,
    id: string,
    version: string,
  ): Promise<VersionWithData>;

  /**
   * Writes a version back as the draft of its locale, or saves it when the collection has `drafts: false`.
   * `POST /_tenon/collections/:collection/:id/versions/:version/restore`
   */
  restoreVersion<K extends keyof Collections<C> & string>(
    collection: K,
    id: string,
    version: string,
  ): Promise<Doc<CollectionFields<C, K>>>;

  /**
   * Deletes a document. Needs a session.
   * `DELETE /_tenon/collections/:collection/:id`
   */
  delete(
    collection: keyof Collections<C> & string,
    id: string,
    options?: DeleteOptions,
  ): Promise<null>;

  /**
   * Returns a global. Fields that were never saved are missing.
   * `GET /_tenon/globals/:name`
   */
  getGlobal<
    K extends keyof Globals<C> & string,
    const O extends ReadOptions<Collections<C>, GlobalFields<C, K>, false, Locale<C>> = {},
  >(
    name: K,
    options?: Checked<O, Collections<C>, GlobalFields<C, K>, Depth<C>, false, Locale<C>>,
  ): Promise<
    Partial<Read<Collections<C>, GlobalFields<C, K>, PopulateOf<O, Depth<C>>, SelectOf<O>>> &
      GlobalMeta<SelectOf<O>> &
      GlobalLocaleMeta<Globals<C>[K], Locale<C>, SelectOf<O>>
  >;

  /**
   * Changes the top-level fields in `data`. Fields left out keep their stored values; `null` clears one. Needs a session.
   * `PUT /_tenon/globals/:name`
   */
  setGlobal<K extends keyof Globals<C> & string>(
    name: K,
    data: Partial<Data<GlobalFields<C, K>>>,
    options?: LocaleOption<C> & ConflictOptions,
  ): Promise<Data<GlobalFields<C, K>> & GlobalMeta>;

  /**
   * Changes the top-level fields of a global's draft. The published data stays. Needs a session.
   * `PUT /_tenon/globals/:name/draft`
   */
  setGlobalDraft<K extends keyof Globals<C> & string>(
    name: K,
    data: Partial<Data<GlobalFields<C, K>>>,
    options?: LocaleOption<C> & ConflictOptions,
  ): Promise<Partial<Data<GlobalFields<C, K>>> & GlobalMeta>;

  /**
   * Publishes the draft of a global. Throws a `CmsError` with status `400` for invalid data. Needs a session.
   * `POST /_tenon/globals/:name/publish`
   */
  publishGlobal<K extends keyof Globals<C> & string>(
    name: K,
    options?: LocaleOption<C> & ConflictOptions,
  ): Promise<Data<GlobalFields<C, K>> & GlobalMeta>;

  /**
   * Drops the draft of a global and returns the published one. Like {@link Client.discard}, it takes `locale` or
   * `{ all: true }`. Needs a session.
   * `DELETE /_tenon/globals/:name/draft`
   */
  discardGlobal<K extends keyof Globals<C> & string>(
    name: K,
    options?: DiscardOption<C>,
  ): Promise<Partial<Data<GlobalFields<C, K>>>>;

  /**
   * Fills the localized fields of `to` with those of `from`, like {@link Client.copyLocale}. Needs a session.
   * `POST /_tenon/globals/:name/locales/:to/copy`
   */
  copyGlobalLocale<K extends keyof Globals<C> & string>(
    name: K,
    locales: { from: Locale<C>; to: Locale<C> },
  ): Promise<Partial<Data<GlobalFields<C, K>>>>;

  /**
   * Deletes the translation of one locale, like {@link Client.removeLocale}. Needs a session.
   * `DELETE /_tenon/globals/:name/locales/:locale`
   */
  removeGlobalLocale<K extends keyof Globals<C> & string>(
    name: K,
    locale: Locale<C>,
  ): Promise<Partial<Data<GlobalFields<C, K>>>>;

  /**
   * Claims or renews the caller's edit lock on a global, like {@link Client.lock}.
   * `POST /_tenon/globals/:name/lock`
   */
  lockGlobal(name: keyof Globals<C> & string, options?: { takeover?: boolean }): Promise<Lock>;

  /**
   * Frees the caller's edit lock on a global, like {@link Client.unlock}.
   * `DELETE /_tenon/globals/:name/lock`
   */
  unlockGlobal(name: keyof Globals<C> & string): Promise<void>;

  /**
   * The versions of a global, like {@link Client.versions}.
   * `GET /_tenon/globals/:name/versions`
   */
  globalVersions(name: keyof Globals<C> & string, options?: LocaleOption<C>): Promise<Version[]>;

  /**
   * One version of a global, like {@link Client.version}.
   * `GET /_tenon/globals/:name/versions/:version`
   */
  globalVersion(name: keyof Globals<C> & string, version: string): Promise<VersionWithData>;

  /**
   * Writes a version of a global back, like {@link Client.restoreVersion}.
   * `POST /_tenon/globals/:name/versions/:version/restore`
   */
  restoreGlobalVersion<K extends keyof Globals<C> & string>(
    name: K,
    version: string,
  ): Promise<Partial<Data<GlobalFields<C, K>>> & GlobalMeta>;

  /**
   * The live preview URL of a document from its unsaved form state, relative to the site origin. `null`: no preview
   * for this document. Throws a `CmsError` with status `404` when the collection has neither `preview` nor `permalink`. Needs a session.
   * `POST /_tenon/collections/:collection/preview-url`
   */
  previewUrl(
    collection: keyof Collections<C> & string,
    data: Record<string, unknown>,
    options?: LocaleOption<C>,
  ): Promise<string | null>;

  /**
   * The live preview URL of a global from its unsaved form state. Like {@link Client.previewUrl}.
   * `POST /_tenon/globals/:name/preview-url`
   */
  previewGlobalUrl(
    name: keyof Globals<C> & string,
    data: Record<string, unknown>,
    options?: LocaleOption<C>,
  ): Promise<string | null>;

  /**
   * Returns the collections and globals with their fields. Needs a session.
   * `GET /_tenon/schema`
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
   * `GET /_tenon/localization`
   */
  localization(): Promise<[Locale<C>] extends [never] ? null : Localization<Locale<C>> | null>;

  /**
   * Creates the first admin and signs them in. Throws a `CmsError` with status `403` once an admin exists.
   * `POST /_tenon/auth/sign-up/email`
   */
  signUp(data: { name: string; email: string; password: string }): Promise<Session["user"]>;

  /**
   * Signs in and sets the session cookie. Throws a `CmsError` with status `401` for a wrong email or password.
   * `POST /_tenon/auth/sign-in/email`
   */
  signIn(data: { email: string; password: string }): Promise<Session["user"]>;

  /** Sends a password-reset link when the account exists. Needs configured email delivery. `redirectTo` is the trusted URL of the new-password form. */
  requestPasswordReset(data: { email: string; redirectTo?: string }): Promise<void>;

  /** Sets a new password using the single-use token from the email link. Does not sign in. */
  resetPassword(data: { token: string; newPassword: string }): Promise<void>;

  /**
   * Signs out and clears the session cookie.
   * `POST /_tenon/auth/sign-out`
   */
  signOut(): Promise<void>;

  /**
   * Returns the signed-in admin, or `null` without a session.
   * `GET /_tenon/auth/get-session`
   * @example
   * const { user } = (await client.getSession()) ?? {}
   * user?.name
   */
  getSession(): Promise<Session | null>;

  /**
   * Calls any route under `/_tenon`, e.g. a plugin's. `body` is sent as JSON, `query` as the query string.
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
    /** Fills the `href` and `src` of every link in an unsaved document. `POST /_tenon/admin/richtext/resolve` */
    resolve(document: RichtextDocument, options?: { locale?: string }): Promise<RichtextDocument>;
    /** Finds link targets by title. `GET /_tenon/admin/richtext/targets` */
    search(options?: { query?: string; locale?: string }): Promise<RichtextTargets>;
  };
  /** The media library. See {@link MediaClient}. */
  media: MediaClient;

  /** Invites to the admin. Listing, creating, resending and revoking need an admin's session. */
  invites: {
    /** Every invite, expired ones flagged. `GET /_tenon/invites` */
    list(): Promise<Invite[]>;
    /**
     * Invites `email` with `role`. `url` is the admin's invite page; it MUST be on the site's origin. A `CmsError` with
     * status `502` means sending failed: its `body` is the {@link InviteResult}, so the link can be sent by hand.
     * `POST /_tenon/invites`
     */
    create(data: { email: string; role: string; url: string }): Promise<InviteResult>;
    /** A new link, so the old one stops working, sent again. `POST /_tenon/invites/:id/resend` */
    resend(id: string, data: { url: string }): Promise<InviteResult>;
    /** `DELETE /_tenon/invites/:id` */
    revoke(id: string): Promise<void>;
    /** The email, role and role label of a valid token. Public. `POST /_tenon/invites/check` */
    check(token: string): Promise<{ email: string; role: string; label: Text }>;
    /** Creates the invited user and signs them in. Public. `POST /_tenon/invites/accept` */
    accept(data: { token: string; name: string; password: string }): Promise<{
      user: Session["user"];
    }>;
  };

  /** API keys. For admins only, with a session: a key cannot manage keys. */
  apiKeys: {
    /** Every key, revoked ones included. `GET /_tenon/api-keys` */
    list(): Promise<ApiKey[]>;
    /**
     * Creates a key with the grid `permissions`. Unknown targets and operations are a 400. `expiresIn` is in seconds,
     * between 1 and 365 days; without it the key does not expire. The result holds the key itself, which is never
     * shown again. `POST /_tenon/api-keys`
     */
    create(data: {
      name: string;
      permissions: ApiKeyPermissions;
      expiresIn?: number;
    }): Promise<NewApiKey>;
    /**
     * Gives a key a new secret. Its id, grid and expiry stay; the old secret stops at once. The result holds the new
     * secret, which is never shown again. A revoked key is a 404. `POST /_tenon/api-keys/:id/roll`
     */
    roll(id: string): Promise<NewApiKey>;
    /** Disables a key. It stays listed. `POST /_tenon/api-keys/:id/revoke` */
    revoke(id: string): Promise<void>;
    /** Deletes a key for good. `DELETE /_tenon/api-keys/:id` */
    delete(id: string): Promise<void>;
  };

  /**
   * The preview cookie. It holds a {@link Perspective}. While it is `drafts`, reads of the signed-in user see drafts,
   * also on the site's pages. Both need a session.
   */
  preview: {
    /** Sets the cookie to `perspective`, default `drafts`. `POST /_tenon/preview` */
    enter(perspective?: Perspective): Promise<void>;
    /** Clears the cookie. `DELETE /_tenon/preview` */
    exit(): Promise<void>;
  };
};
