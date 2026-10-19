import { checkRichtextConfig } from "../richtext/config/check-config.ts";
import { mergeAdmin } from "../admin/merge/merge-options.ts";
import type { User } from "better-auth";
import { consola } from "consola";
import { createApp } from "../http/index.ts";
import { caller } from "../auth/get-caller.ts";
import { createMediaCore } from "../media/runtime/create-media-core.ts";
import type { MediaOptions } from "../media/config/options.ts";
import { type Plugin } from "../plugins/index.ts";
import type { Collection, Global, Schema } from "../schema/index.ts";
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
  SettingsGlobals,
  SettingsOptions,
} from "./config/options.ts";
import { mergePlugins } from "./config/merge-plugins.ts";
import { createSiteSettings } from "./config/site-settings.ts";
import { checkSchema } from "../schema/validation/check-schema.ts";
import { defaultMedia } from "integral-cms/media/default";
import { mediaCollection } from "../media/config/collection.ts";
import { localizedKeys } from "../schema/traversal/localized-fields.ts";
import { createRuntime } from "./runtime/create-runtime.ts";
import type { Core, Perspective } from "./runtime/types.ts";
import { outerScope } from "./runtime/operation-context.ts";
import { createEmail } from "../email/create-email.ts";

/**
 * Creates a CMS instance.
 * Export it as the default export of `integral.config.ts` to bootstrap the CMS:
 * The returned object is the local API for server code. Nothing connects until the first call.
 *
 * @example
 *   ```ts
 * import { defineCms } from "integral-cms";
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
>({
  database,
  secret,
  auth: host = {} as A,
  email: emailOptions,
  populate: populateOptions = {} as P,
  hooks: rootHooks = {},
  plugins = [] as unknown as PL,
  media: mediaOption,
  settings: settingsOption,
  localization: localizationOption,
  site,
  admin,
  ...own
}: CmsOptions<C, G, A, P, PL, M, S, L>) {
  type T = {
    collections?: C & PluginCollections<PL> & MediaCollections<M>;
    globals?: G & PluginGlobals<PL> & SettingsGlobals<S>;
  };
  type D = DefaultDepth<P>;

  /* ── Options ───────────────────────────────────────────────────────────────────────── */

  if (site !== undefined && !/^https?:$/.test(URL.parse(site)?.protocol ?? ""))
    throw new Error("integral-cms: `site` MUST be an http(s) URL");

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

  const pluginsSchema = mergePlugins(plugins, own);
  const settingsSchema = createSiteSettings(
    pluginsSchema,
    settingsOption,
    !!mediaOptions,
    !!localization,
  );
  const mediaSchema = mediaOptions ? { collections: { media: mediaCollection } } : undefined;
  const schema = {
    ...settingsSchema,
    collections: { ...settingsSchema.collections, ...mediaSchema?.collections },
  };

  // check if the schema is valid before proceeding
  checkSchema(schema, populateOption, localization);

  const adminRuntime = mergeAdmin(plugins, admin);
  checkRichtextConfig(schema, adminRuntime.richtext);

  const count = (o: object) => Object.keys(o).length;
  consola
    .withTag("integral")
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
  const email = createEmail(emailOptions);
  const { db, auth, getSession } = createRuntime<A>(
    database,
    secret,
    host,
    {
      current: Object.fromEntries(
        entries.map(([id, e]) => [id, e.localized ? localizedKeys(e) : null]),
      ),
      defaultLocale: localization?.defaultLocale ?? "",
    },
    emailOptions && { api: email, templates: emailOptions.templates },
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
    email,
    localApi: (scope) => createLocalApi(core, scope),
    media: mediaOptions && createMediaCore(mediaOptions, schema),
    admin: adminRuntime,
  };

  /* ── Instance ──────────────────────────────────────────────────────────────────────── */

  const app = createApp(core, site);

  /**
   * The instance for one caller.
   * @param user The user hooks get. `null` for server code.
   * @param perspective Which version of documents reads return.
   */
  function createInstance(user: User | null, perspective: Perspective) {
    return {
      schema: schema as unknown as T,
      auth,
      populate: populateOption as { depth: D; maxDepth: number },
      /** The `localization` option with defaults, or `undefined`. `locales` keeps its literal types. */
      localization,
      // The local API is untyped. `Api` adds the schema's types.
      ...(createLocalApi(core, outerScope(user, perspective)) as unknown as Api<T, D, L>),

      /** Returns a copy whose reads include drafts. */
      withDrafts<S>(this: S): S {
        return createInstance(user, "drafts") as S; // (`<S>(this: S): S` here and on `withSession` avoids TS2589.)
      },

      /** Returns a copy for the session user of `request`. Reads include drafts with the preview cookie. */
      async withSession<S>(this: S, request: Request): Promise<S> {
        const visitor = await caller(getSession, request);
        return createInstance(visitor.user, visitor.perspective) as S;
      },

      /** Handles `/api/cms` requests. Mount it in any framework that speaks Request/Response. */
      fetch(request: Request): Promise<Response> {
        return app.fetch(request) as Promise<Response>;
      },
    };
  }

  return createInstance(null, "published") as ReturnType<typeof createInstance> & MediaOf<M>;
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
