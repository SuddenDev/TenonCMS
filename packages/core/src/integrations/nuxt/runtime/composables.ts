import { useAsyncData, useRequestEvent } from "#app";
import type cms from "#integral/config";
import {
  type Checked,
  type Collections as HttpCollections,
  createClient,
  type FindOptions,
  type Globals as HttpGlobals,
  type ReadOptions,
} from "integral-cms/client";
import { getDrafts, merge, subscribe } from "integral-cms/preview";
import { computed, onScopeDispose, type Ref, shallowRef } from "vue";

// The client's types, so the options check the same way. The collection methods cast `options` when they pass it on:
// TypeScript cannot match the two generic `select` checks, and the composable's own parameter already checks it.
type Collections = HttpCollections<typeof cms>;
type Globals = HttpGlobals<typeof cms>;
type Fields<K extends keyof Collections> = Collections[K]["fields"];
type Depth = (typeof cms)["populate"]["depth"];

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
  const event = useRequestEvent();
  const client = createClient<typeof cms>({
    fetch: event && ((input, init) => event.fetch(String(input), init)),
  });

  return {
    find<K extends keyof Collections & string, const O extends FindOptions<typeof cms, K> = {}>(
      collection: K,
      options: Checked<O, Collections, Fields<K>, Depth> = {} as never,
    ) {
      return load(collection, `${collection}:${JSON.stringify(options)}`, () =>
        client.find<K, O>(collection, options as never),
      );
    },

    findOne<K extends keyof Collections & string, const O extends FindOptions<typeof cms, K>>(
      collection: K,
      options: Checked<O, Collections, Fields<K>, Depth>,
    ) {
      return load(
        collection,
        `${collection}:one:${JSON.stringify(options)}`,
        async () => (await client.findOne<K, O>(collection, options as never)) ?? null,
      );
    },

    findById<
      K extends keyof Collections & string,
      const O extends ReadOptions<Collections, Fields<K>> = {},
    >(collection: K, id: string, options: Checked<O, Collections, Fields<K>, Depth> = {} as never) {
      return load(collection, `${collection}:${id}:${JSON.stringify(options)}`, () =>
        client.findById<K, O>(collection, id, options as never),
      );
    },

    getGlobal<
      K extends keyof Globals & string,
      const O extends ReadOptions<Collections, Globals[K]["fields"], false> = {},
    >(name: K, options: Checked<O, Collections, Globals[K]["fields"], Depth, false> = {} as never) {
      return load(name, `global:${name}:${JSON.stringify(options)}`, () =>
        client.getGlobal<K, O>(name, options),
      );
    },
  };
}
