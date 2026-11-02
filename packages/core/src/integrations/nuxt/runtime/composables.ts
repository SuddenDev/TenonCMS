import {
  navigateTo,
  onNuxtReady,
  useAsyncData,
  useNuxtApp,
  useRequestEvent,
  useRoute,
  useState,
} from "#app";
import type cms from "#tenon/config";
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
} from "tenoncms/client";
import { getDrafts, isLivePreview, merge, setReadDocuments, subscribe } from "tenoncms/preview";
import {
  computed,
  type MaybeRefOrGetter,
  onScopeDispose,
  type Ref,
  shallowRef,
  toRaw,
  toValue,
  watchEffect,
} from "vue";

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

// One client per Nuxt app. During SSR it reads in-process through the request.
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

/** The localization config in the payload. The plugin loads it before the first page renders. */
const useLocalization = () => useState<Config>("tenon:localization");

/** Loads the localization config once per request, or once in the browser without SSR. */
export async function loadLocalization() {
  const config = useLocalization();
  if (config.value === undefined) config.value = (await useClient().localization()) as Config;
}

// Merges the admin's unsaved changes into `data` while the page runs in the live preview, and lists the documents
// in "On this page" while the read lives. `find` gets each document merged. The awaited result gets the same `data`, because Nuxt resolves it to an object of its own. Nuxt also sets
// `then`, `catch` and `finally` as own properties, bound to its promise. They MUST NOT replace the merged promise's.
function live<R extends Promise<{ data: Ref<unknown> }> & { data: Ref<unknown> }>(
  collection: string,
  result: R,
): R {
  const drafts = shallowRef(getDrafts());
  const source = result.data;
  // Servers render once and never dispose the scope, so only browsers subscribe.
  if (globalThis.window) {
    onScopeDispose(subscribe((d) => (drafts.value = d)));
    const owner = {};
    watchEffect(() => setReadDocuments(owner, documentRefs(collection, source.value)));
    onScopeDispose(() => setReadDocuments(owner, []));
  }
  const data = computed({
    get: () => {
      const value = source.value;
      return Array.isArray(value)
        ? value.map((doc) => merge(collection, doc, drafts.value))
        : merge(collection, value, drafts.value);
    },
    set: (value) => (source.value = value),
  });
  const { then, catch: _catch, finally: _finally, ...fields } = result;
  return Object.assign(
    Promise.resolve(result).then((r) => ({ ...r, data })),
    { ...fields, data },
  ) as unknown as R;
}

// A global has no `id`, so its key ends empty, as in the preview's drafts.
const documentRefs = (collection: string, value: unknown) =>
  (Array.isArray(value) ? value : [value])
    .filter((doc): doc is { id?: unknown } => !!doc && typeof doc === "object")
    .map((doc) => ({ collection, id: String(doc.id ?? "") }));

// Reads once per key into Nuxt's payload, with the preview drafts merged in.
function load<T>(name: string, key: () => string, read: () => Promise<T>) {
  return live(
    name,
    useAsyncData(() => `tenon:${key()}`, read),
  );
}

/**
 * The client's read methods for pages, each wrapped in `useAsyncData`. During SSR the request stays in-process;
 * on client-side navigation it hits the public read API. In the admin's live preview, `data` shows unsaved changes.
 * @example
 * const { data: post } = await useTenon().findOne('posts', { where: { slug } })
 */
export function useTenon() {
  const client = useClient();
  const route = useRoute();
  const config = useLocalization();

  // The route's locale unless the options set one. The key holds it, so `/about` and `/de/about` read apart.
  function withLocale<O extends object>(options: O): O {
    if ("locale" in options || !config.value) return options;
    return { ...options, locale: localeFromPath(route.path, config.value).locale };
  }
  const keyOf = (key: string, options: object) => `${key}:${JSON.stringify(withLocale(options))}`;

  return {
    find<K extends keyof Collections & string, const O extends FindOptions<typeof cms, K> = {}>(
      collection: K,
      options: MaybeRefOrGetter<O> &
        MaybeRefOrGetter<Checked<O, Collections, Fields<K>, Depth>> = {} as never,
    ) {
      return load(
        collection,
        () => keyOf(collection, toValue(options)),
        async () => client.find<K, O>(collection, withLocale(toValue(options)) as never),
      );
    },

    findOne<K extends keyof Collections & string, const O extends FindOptions<typeof cms, K>>(
      collection: K,
      options: MaybeRefOrGetter<O> & MaybeRefOrGetter<Checked<O, Collections, Fields<K>, Depth>>,
    ) {
      return load(
        collection,
        () => keyOf(`${collection}:one`, toValue(options)),
        async () =>
          (await client.findOne<K, O>(collection, withLocale(toValue(options)) as never)) ?? null,
      );
    },

    findById<
      K extends keyof Collections & string,
      const O extends ReadOptions<Collections, Fields<K>, true, L> = {},
    >(
      collection: K,
      id: MaybeRefOrGetter<string>,
      options: MaybeRefOrGetter<O> &
        MaybeRefOrGetter<Checked<O, Collections, Fields<K>, Depth, true, L>> = {} as never,
    ) {
      return load(
        collection,
        () => keyOf(`${collection}:${toValue(id)}`, toValue(options)),
        async () => {
          const value = toValue(id);
          return client.findById<K, O>(collection, value, withLocale(toValue(options)) as never);
        },
      );
    },

    getGlobal<
      K extends keyof Globals & string,
      const O extends ReadOptions<Collections, Globals[K]["fields"], false, L> = {},
    >(
      name: K,
      options: MaybeRefOrGetter<O> &
        MaybeRefOrGetter<
          Checked<O, Collections, Globals[K]["fields"], Depth, false, L>
        > = {} as never,
    ) {
      return load(
        name,
        () => keyOf(`global:${name}`, toValue(options)),
        async () => client.getGlobal<K, O>(name, withLocale(toValue(options)) as never),
      );
    },
  };
}

/**
 * The localization config and the route's locale. Without `localization` in `defineCms()`, `locales` is empty,
 * `locale` and `defaultLocale` are `undefined`, and `localePath()` returns the path.
 * @example
 * const { locale, switchLocale } = useLocale()
 */
export function useLocale() {
  const route = useRoute();
  const data = useLocalization();
  const alternates = useState<Alternates>("tenon:alternates", () => null);

  const config = computed(() => data.value ?? null);
  const current = computed(() => config.value && localeFromPath(route.path, config.value));
  const locale = computed(() => current.value?.locale as L | undefined);
  const path = computed(() => current.value?.path ?? route.path);
  const switchLocalePath = (locale: L) =>
    config.value ? switchTarget(config.value, path.value, locale, alternates.value) : route.path;

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
    /** The page's alternate in `locale`, else that locale's homepage. */
    switchLocalePath,
    /** Navigates to the page's alternate in `locale`, else that locale's homepage. */
    switchLocale(locale: L) {
      if (!config.value) return;
      return navigateTo(switchLocalePath(locale));
    },
  };
}

/**
 * Whether the page runs in the admin's live preview, for example to skip intro animations. During SSR only the admin's
 * iframe shows; a preview tab turns it `true` after hydration, so the first render matches the server's.
 * @example
 * const livePreview = useLivePreview()
 */
export function useLivePreview(): Readonly<Ref<boolean>> {
  const event = useRequestEvent();
  const state = useState("tenon:live-preview", () => isLivePreview(event?.headers));
  if (import.meta.client) onNuxtReady(() => (state.value = isLivePreview()));
  return computed(() => state.value);
}

/**
 * Registers the `alternates` of the page's document, so `switchLocale()` links to its translations. The page
 * MUST read with `alternates: true`.
 * @example
 * useAlternates(() => page.value?.alternates)
 */
export function useAlternates(source: () => Alternates | undefined) {
  const alternates = useState<Alternates>("tenon:alternates", () => null);
  let mine: Alternates = null;
  watchEffect(() => (alternates.value = mine = source() ?? null));
  // A page that mounts first sets its own before this one is disposed.
  onScopeDispose(() => {
    if (toRaw(alternates.value) === toRaw(mine)) alternates.value = null;
  });
}
