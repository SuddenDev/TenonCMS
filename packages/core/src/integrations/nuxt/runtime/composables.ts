import {
  navigateTo,
  useAsyncData,
  useNuxtApp,
  useNuxtData,
  useRequestEvent,
  useRoute,
  useState,
} from "#app";
import type cms from "#integral/config";
import {
  type Checked,
  type Collections as HttpCollections,
  createClient,
  type FindOptions,
  type Globals as HttpGlobals,
  localeFromPath,
  localizePath,
  type Locale,
  type Localization,
  type ReadOptions,
  switchTarget,
} from "integral-cms/client";
import { getDrafts, merge, subscribe } from "integral-cms/preview";
import { computed, onScopeDispose, type Ref, shallowRef, watchEffect } from "vue";

// The client's types, so the options check the same way. The collection methods cast `options` when they pass it on:
// TypeScript cannot match the two generic `select` checks, and the composable's own parameter already checks it.
type Collections = HttpCollections<typeof cms>;
type Globals = HttpGlobals<typeof cms>;
type Fields<K extends keyof Collections> = Collections[K]["fields"];
type Depth = (typeof cms)["populate"]["depth"];

type L = Locale<typeof cms>;

type Client = ReturnType<typeof createClient<typeof cms>>;
// Untyped by locale, so the helpers work for every instance; `null` without `localization`.
type Config = Localization<string> | null;
type Alternates = Record<string, string> | null;

const LOCALIZATION = "integral:localization";

const localization = (client: Client) => client.localization() as Promise<Config>;

// One client per Nuxt app, so `localization()` is fetched once. During SSR it reads in-process through the request.
const clients = new WeakMap<object, Client>();
function useClient(): Client {
  const nuxtApp = useNuxtApp();
  const event = useRequestEvent();
  let client = clients.get(nuxtApp);
  if (!client) {
    client = createClient<typeof cms>({
      fetch: event && ((input, init) => event.fetch(String(input), init)),
    });
    clients.set(nuxtApp, client);
  }
  return client;
}

// Merges the admin's unsaved changes into `data` while the page runs in the live preview. `find` gets each document
// merged. The awaited result gets the same `data`, because Nuxt resolves it to an object of its own.
function live<R extends PromiseLike<{ data: Ref<unknown> }> & { data: Ref<unknown> }>(
  collection: string,
  result: R,
): R {
  const drafts = shallowRef(getDrafts());
  // Servers render once and never dispose the scope, so only browsers subscribe.
  if (globalThis.window) onScopeDispose(subscribe((d) => (drafts.value = d)));
  const source = result.data;
  const data = computed({
    get: () => {
      const value = source.value;
      return Array.isArray(value)
        ? value.map((doc) => merge(collection, doc, drafts.value))
        : merge(collection, value, drafts.value);
    },
    set: (value) => (source.value = value),
  });
  return Object.assign(
    Promise.resolve(result).then((r) => ({ ...r, data })),
    { ...result, data },
  ) as unknown as R;
}

// Reads once per key into Nuxt's payload, with the preview drafts merged in.
function load<T>(name: string, key: string, read: () => Promise<T>) {
  return live(name, useAsyncData(`integral:${key}`, read));
}

/**
 * The client's read methods for pages, each wrapped in `useAsyncData`. During SSR the request stays in-process;
 * on client-side navigation it hits the public read API. In the admin's live preview, `data` shows unsaved changes.
 * @example
 * const { data: post } = await useIntegral().findOne('posts', { where: { slug } })
 */
export function useIntegral() {
  const client = useClient();
  const route = useRoute();
  const cached = useNuxtData<Config>(LOCALIZATION).data;

  // The route's locale unless the options set one. The payload has the config after hydration.
  async function withLocale<O extends object>(options: O): Promise<O> {
    if ("locale" in options) return options;
    const config = cached.value !== undefined ? cached.value : await localization(client);
    return config ? { ...options, locale: localeFromPath(route.path, config).locale } : options;
  }

  return {
    find<K extends keyof Collections & string, const O extends FindOptions<typeof cms, K> = {}>(
      collection: K,
      options: Checked<O, Collections, Fields<K>, Depth> = {} as never,
    ) {
      return load(collection, `${collection}:${JSON.stringify(options)}`, async () =>
        client.find<K, O>(collection, (await withLocale(options)) as never),
      );
    },

    findOne<K extends keyof Collections & string, const O extends FindOptions<typeof cms, K>>(
      collection: K,
      options: Checked<O, Collections, Fields<K>, Depth>,
    ) {
      return load(
        collection,
        `${collection}:one:${JSON.stringify(options)}`,
        async () =>
          (await client.findOne<K, O>(collection, (await withLocale(options)) as never)) ?? null,
      );
    },

    findById<
      K extends keyof Collections & string,
      const O extends ReadOptions<Collections, Fields<K>, true, L> = {},
    >(
      collection: K,
      id: string,
      options: Checked<O, Collections, Fields<K>, Depth, true, L> = {} as never,
    ) {
      return load(collection, `${collection}:${id}:${JSON.stringify(options)}`, async () =>
        client.findById<K, O>(collection, id, (await withLocale(options)) as never),
      );
    },

    getGlobal<
      K extends keyof Globals & string,
      const O extends ReadOptions<Collections, Globals[K]["fields"], false, L> = {},
    >(
      name: K,
      options: Checked<O, Collections, Globals[K]["fields"], Depth, false, L> = {} as never,
    ) {
      return load(name, `global:${name}:${JSON.stringify(options)}`, async () =>
        client.getGlobal<K, O>(name, (await withLocale(options)) as never),
      );
    },
  };
}

/**
 * The localization config and the route's locale. Without `localization` in `defineCms()`, `locales` is empty,
 * `locale` and `defaultLocale` are `undefined`, and `localePath()` returns the path. The config loads like any
 * `useAsyncData` call: during SSR in-process, then from the payload.
 * @example
 * const { locale, switchLocale } = useLocale()
 */
export function useLocale() {
  const client = useClient();
  const route = useRoute();
  const { data } = useAsyncData(LOCALIZATION, () => localization(client));
  const alternates = useState<Alternates>("integral:alternates", () => null);

  const config = computed(() => data.value ?? null);
  const current = computed(() => config.value && localeFromPath(route.path, config.value));
  const locale = computed(() => current.value?.locale as L | undefined);
  const path = computed(() => current.value?.path ?? route.path);

  return {
    locales: computed(() => config.value?.locales ?? []),
    defaultLocale: computed(() => config.value?.defaultLocale),
    /** The locale of the route, from its prefix. */
    locale,
    /** The route's path without the locale prefix. */
    path,
    /** Prefixes `path` with `locale` (default: the route's). */
    localePath(path: string, locale?: L): string {
      const l = locale ?? current.value?.locale;
      return config.value && l ? localizePath(path, l, config.value) : path;
    },
    /** Navigates to the page's alternate in `locale` (see `useAlternates()`), else to the same path in it. */
    switchLocale(locale: L) {
      if (!config.value) return;
      return navigateTo(switchTarget(config.value, path.value, locale, alternates.value));
    },
  };
}

/**
 * Registers the `alternates` of the page's document, so `switchLocale()` links to its translations. The page
 * MUST read with `alternates: true`.
 * @example
 * useAlternates(() => page.value?.alternates)
 */
export function useAlternates(source: () => Alternates | undefined) {
  const alternates = useState<Alternates>("integral:alternates", () => null);
  let mine: Alternates = null;
  watchEffect(() => (alternates.value = mine = source() ?? null));
  // A page that mounts first sets its own before this one is disposed.
  onScopeDispose(() => {
    if (alternates.value === mine) alternates.value = null;
  });
}
