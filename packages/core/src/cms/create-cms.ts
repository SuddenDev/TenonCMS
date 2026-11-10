import { checkRichtextConfig } from "../richtext/config/check-config.ts";
import { mergeAdmin } from "../admin/merge/merge-options.ts";
import { consola } from "consola";
import { createApp } from "../http/index.ts";
import { caller } from "../auth/get-caller.ts";
import { createMediaCore } from "../media/runtime/create-media-core.ts";
import type { MediaOptions } from "../media/config/options.ts";
import { type Plugin } from "../plugins/index.ts";
import type { Block, Collection, Global, Schema } from "../schema/index.ts";
import type { Api } from "./api/types.ts";
import { createLocalApi } from "./api/create-local-api.ts";
import type { AuthOptions } from "../auth/config/options.ts";
import type {
  CmsOptions,
  DefaultDepth,
  Localization,
  MediaCollections,
  MediaOf,
  PluginCollections,
  PluginGlobals,
  PopulateOptions,
  Preset,
  PresetBlocks,
  SettingsGlobals,
  SettingsOptions,
} from "./config/options.ts";
import { mergePlugins } from "./config/merge-plugins.ts";
import { mergePresets } from "./config/merge-presets.ts";
import { createSiteSettings } from "./config/site-settings.ts";
import { checkSchema } from "../schema/validation/check-schema.ts";
import { linkBlocks } from "../schema/config/link-blocks.ts";
import type { LinkedOwners } from "../schema/inference/linked.ts";
import { defaultMedia } from "tenoncms/media/default";
import { mediaCollection } from "../media/config/collection.ts";
import { localizedKeys } from "../schema/traversal/localized-fields.ts";
import { createRuntime } from "./runtime/create-runtime.ts";
import type { DatabaseOptions } from "../db/create-db.ts";
import type { Caller, Core } from "./runtime/types.ts";
import { outerScope } from "./runtime/operation-context.ts";
import { createEmail } from "../email/create-email.ts";
import { emailTemplates } from "../email/templates.ts";
import { normalizeRoles } from "../users/roles.ts";
import { checkAccess, checkRoles } from "../access/check-access.ts";
import { resolveJobs } from "../jobs/config/resolve-jobs.ts";
import { scheduleTasks } from "../schedule/tasks.ts";
import { runJobs } from "../jobs/operations/run-jobs.operation.ts";
import type { RunResult } from "../jobs/types.ts";
import { sitemapEntries } from "../seo/sitemap-entries.ts";

/**
 * Creates a CMS instance.
 * Export it as the default export of `tenon.config.ts` to bootstrap the CMS:
 * The returned object is the local API for server code. Nothing connects until the first call.
 *
 * @example
 *   ```ts
 * import { defineCms } from "tenoncms";
 *
 * export default defineCms({
 *   // your CMS configuration here
 * });
 * ```
 */
export function defineCms<
  const C extends Record<string, Collection> = {},
  const G extends Record<string, Global> = {},
  const A extends AuthOptions = {},
  const P extends PopulateOptions = {},
  const PL extends readonly Plugin[] = [],
  const M extends MediaOptions | boolean | undefined = undefined,
  const S extends SettingsOptions | false | undefined = undefined,
  const L extends string = never,
  const B extends Record<string, Block> = {},
  const PR extends readonly Preset[] = [],
>({
  database,
  secret,
  auth: host = {} as A,
  email: emailOptions,
  populate: populateOptions = {} as P,
  hooks: rootHooks = {},
  plugins = [] as unknown as PL,
  presets = [] as unknown as PR,
  media: mediaOption,
  settings: settingsOption,
  localization: localizationOption,
  site,
  admin,
  roles: roleOptions,
  sitemap = {},
  robots = {},
  jobs: jobsOption,
  ...own
}: CmsOptions<C, G, A, P, PL, M, S, L, B, PR>) {
  type T = {
    collections?: LinkedOwners<
      C & PluginCollections<PR> & PluginCollections<PL> & MediaCollections<M>,
      B & PresetBlocks<PR>
    >;
    globals?: LinkedOwners<
      G & PluginGlobals<PR> & PluginGlobals<PL> & SettingsGlobals<S>,
      B & PresetBlocks<PR>
    >;
  };
  type D = DefaultDepth<P>;

  /* ── Options ───────────────────────────────────────────────────────────────────────── */

  if (site !== undefined && !/^https?:$/.test(URL.parse(site)?.protocol ?? ""))
    throw new Error("tenoncms: `site` MUST be an http(s) URL");

  const roles = normalizeRoles(roleOptions);
  const populateOption = {
    depth: populateOptions.depth ?? 2,
    maxDepth: populateOptions.maxDepth ?? 5,
  };
  const localization: Localization<L> | undefined = localizationOption && {
    fallback: true,
    routing: { prefix: "except-default" },
    ...localizationOption,
  };
  const mediaOptions =
    typeof mediaOption === "object"
      ? mediaOption
      : mediaOption !== false
        ? defaultMedia(!!mediaOption)
        : undefined;

  /* ── Schema creation + validation ────────────────────────────────────────────────────── */

  const pluginsSchema = mergePlugins(plugins, mergePresets(presets, own));
  const { schema: settingsSchema, translations } = createSiteSettings(
    pluginsSchema,
    settingsOption,
    !!mediaOptions,
    !!localization,
  );
  const mediaSchema = mediaOptions
    ? { collections: { media: { ...mediaCollection, access: mediaOptions.access } } }
    : undefined;
  const schema = linkBlocks({
    ...settingsSchema,
    collections: { ...settingsSchema.collections, ...mediaSchema?.collections },
  });

  // check if the schema is valid before proceeding
  checkSchema(schema, populateOption, localization);
  checkAccess(schema, roles);
  const jobs = resolveJobs(plugins, jobsOption, roles, scheduleTasks);

  const adminRuntime = mergeAdmin(plugins, admin);
  const knownRoles = new Set(roles.map((r) => r.name));
  for (const [key, { access }] of adminRuntime.actions)
    checkRoles(knownRoles, `admin action "${key}"`, { run: access });
  checkRichtextConfig(schema, adminRuntime.richtext);

  const count = (o: object) => Object.keys(o).length;
  consola
    .withTag("tenon")
    .info(
      `Initialized with ${count(schema.collections)} collection(s), ${count(schema.globals)} global(s)`,
    );

  /* ── Core, Runtime(db, auth) ────────────────────────────────────────────── */

  const entries: Array<[string, Collection | Global]> = [
    ...Object.entries<Collection>(schema.collections).map(([n, e]): [string, Collection] => [
      `collection:${n}`,
      e,
    ]),
    ...Object.entries<Global>(schema.globals).map(([n, e]): [string, Global] => [`global:${n}`, e]),
  ];

  // localization
  const localized = {
    current: Object.fromEntries(
      entries.map(([id, e]) => [id, e.localized ? localizedKeys(e) : null]),
    ),
    defaultLocale: localization?.defaultLocale ?? "",
    fields: Object.fromEntries(entries.map(([id, e]) => [id, e.fields])),
  };

  // email service
  const email = createEmail(emailOptions);

  // auth
  const coreAuth = {
    email: emailOptions && { api: email, templates: emailOptions.templates },
    appName: adminRuntime.descriptor.name,
    roles,
  };

  // media
  const media = mediaOptions && createMediaCore(mediaOptions, schema);

  /** The part of an instance bound to one database: connection, auth and the HTTP app. */
  function bindDatabase(database: DatabaseOptions, wake: (at: number) => void = () => {}) {
    const { db, auth, getSession, getApiKey } = createRuntime<A>(
      database,
      secret,
      host,
      localized,
      coreAuth,
    );

    const core: Core = {
      schema,
      plugins,
      rootHooks,
      populate: populateOption,
      localization,
      db,
      auth,
      getSession,
      getApiKey,
      email,
      emailTemplates: emailOptions && { ...emailTemplates, ...emailOptions.templates },
      roles,
      translations,
      sitemap,
      robots,
      jobs: { ...jobs, wake },
      localApi: (scope) => createLocalApi(core, scope),
      media,
      admin: adminRuntime,
    };
    return { core, auth, app: createApp(core, site) };
  }

  /* ── Instance ──────────────────────────────────────────────────────────────────────── */

  /**
   * The instance for one caller.
   * @param bound The database part from `bindDatabase()`.
   * @param visitor The user or API key hooks get, none for server code, and which version of documents reads return.
   * @param overrideAccess Whether the access rules are skipped: server code skips them, `withSession()` does not.
   */
  function createInstance(
    bound: ReturnType<typeof bindDatabase>,
    visitor: Caller,
    overrideAccess: boolean,
  ) {
    const { core, auth, app } = bound;
    const api = createLocalApi(core, outerScope(visitor, overrideAccess)) as unknown as Api<
      T,
      D,
      L
    >;
    return {
      schema: schema as unknown as T,
      auth,
      populate: populateOption as { depth: D; maxDepth: number },
      /** The `localization` option with defaults, or `undefined`. `locales` keeps its literal types. */
      localization,
      // The local API is untyped. `Api` adds the schema's types.
      ...api,

      /**
       * The job queue, and `run()`: one tick of the clock. Call `run()` from the host's trigger, never from a hook.
       * Hooks get `queue()` only, because running jobs inside a hook's open transaction blocks a single-connection
       * database.
       */
      jobs: { ...api.jobs, run: (): Promise<RunResult> => runJobs(core) },

      /** Returns a copy whose reads include drafts. */
      withDrafts<S>(this: S): S {
        return createInstance(bound, { ...visitor, perspective: "drafts" }, overrideAccess) as S; // (`<S>(this: S): S` here and on `withSession` avoids TS2589.)
      },

      /**
       * Returns a copy for the session user or API key of `request`, which the access rules check. Reads include drafts
       * with the preview cookie.
       */
      async withSession<S>(this: S, request: Request): Promise<S> {
        return createInstance(bound, await caller(core, request), false) as S;
      },

      /**
       * The entries of `/sitemap.xml`, absolute against the site URL (the `general` settings' `url`, then `site`).
       * Render them with `sitemapXml()` in a route of your own.
       */
      sitemap: () => sitemapEntries(core, { site }),

      /** Handles `/_tenon`, `/sitemap.xml` and `/robots.txt`. Mount it in any framework that speaks Request/Response. */
      fetch(request: Request): Promise<Response> {
        return app.fetch(request) as Promise<Response>;
      },
    };
  }

  const root = (database: DatabaseOptions, wake?: (at: number) => void) =>
    createInstance(bindDatabase(database, wake), { user: null, perspective: "published" }, true);
  const cms = root(database);
  copies.set(cms, root);
  return cms as ReturnType<typeof createInstance> & MediaOf<M>;
}

export type Cms<T extends Schema> = ReturnType<
  typeof defineCms<
    NonNullable<T["collections"]>,
    NonNullable<T["globals"]>,
    {},
    {},
    [],
    undefined,
    false,
    string
  >
>;

// The instance of each `defineCms()` call, mapped to how it builds a copy on another database.
const copies = new WeakMap<
  object,
  (database: DatabaseOptions, wake?: (at: number) => void) => object
>();

/**
 * A copy of `cms` on another database, with its own connection, migrations and auth. Schema and options stay shared.
 * The Durable Object adapter binds each object's storage this way.
 * @param cms The instance that `defineCms()` returns, not one from `withSession()` or `withDrafts()`.
 * @param options `wake(at)` runs when a job is queued that is due at `at` (epoch milliseconds), after the write's
 * commit. The Durable Object adapter sets an alarm with it.
 * @returns A server instance, like the one `defineCms()` returns.
 */
export function withDatabase<C extends object>(
  cms: C,
  database: DatabaseOptions,
  { wake }: { wake?: (at: number) => void } = {},
): C {
  const copy = copies.get(cms);
  if (!copy) throw new Error("tenoncms: `withDatabase()` takes the instance from `defineCms()`");
  return copy(database, wake) as C;
}
