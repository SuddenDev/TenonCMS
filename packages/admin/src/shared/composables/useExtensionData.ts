import { inject, onScopeDispose, ref, shallowRef, watch } from "vue";
import { client, CmsError } from "@/shared/api";
import { sessionKey } from "@/shared/options";

/** What `POST /admin/load` selects: a custom field of a document or global, or a custom page. */
export type LoadRequest =
  | {
      kind: "field";
      type: string;
      path: string;
      owner: { collection: string; id?: string } | { global: string };
    }
  | {
      kind: "page";
      key: string;
      params: Record<string, unknown>;
      query: Record<string, unknown>;
    };

export type ExtensionData<R extends object = LoadRequest> = ReturnType<typeof useExtensionData<R>>;

/**
 * Loads the server data of one field or page registration.
 *
 * `request` returns the body to send, or `undefined` for no request. It reloads when the body changes.
 * `result` holds the last settled data and the request that produced it. It keeps the previous result while
 * a new request is pending, so a consumer MUST take what belongs together from `result.request`.
 * Responses of an older request and responses after cleanup are ignored.
 */
export function useExtensionData<R extends object = LoadRequest>(request: () => R | undefined) {
  const session = inject(sessionKey, undefined);
  const result = shallowRef<{ request: R; data: unknown }>();
  const loading = ref(false);
  const error = ref<Error>();
  let generation = 0;
  let current: R | undefined;
  let stopped = false;

  async function run() {
    const mine = ++generation;
    const body = current;
    error.value = undefined;
    if (!body) {
      result.value = undefined;
      loading.value = false;
      return;
    }
    if (stopped) return;
    loading.value = true;
    try {
      const { data } = await client.request<{ data: unknown }>("/admin/load", {
        method: "POST",
        body,
      });
      if (mine !== generation) return;
      result.value = { request: body, data };
    } catch (e) {
      if (mine !== generation) return;
      if (e instanceof CmsError && e.status === 401) {
        stopped = true;
        session?.expire();
      } else error.value = e as Error;
    }
    loading.value = false;
  }

  watch(
    () => JSON.stringify(request() ?? null),
    () => {
      current = request();
      void run();
    },
    { immediate: true },
  );
  onScopeDispose(() => {
    generation++;
    stopped = true;
  });

  return { result, loading, error, reload: run };
}
