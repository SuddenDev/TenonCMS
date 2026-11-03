import { computed, shallowRef, watch } from "vue";
import type {
  BrowserValue,
  FieldDescription,
  FieldDescriptionContext,
  Text,
} from "../../../../core/src/admin/index.d.ts";
import {
  loadClientRef,
  type ClientRegistry,
} from "../../../../core/src/admin/browser/lazy-mount.ts";
import { isRef, isText } from "../../../../core/src/admin/describe/registration-checks.ts";

/** Loads browser help once per reference and evaluates it against current unsaved data. */
export function useFieldDescription(
  source: () => Text | BrowserValue<FieldDescription> | undefined,
  context: () => FieldDescriptionContext,
  registry: ClientRegistry,
) {
  const callback = shallowRef<FieldDescription>();
  const loadError = shallowRef<Error>();
  watch(
    source,
    (value, _, onCleanup) => {
      let disposed = false;
      onCleanup(() => {
        disposed = true;
      });
      callback.value = undefined;
      loadError.value = undefined;
      if (!isRef(value)) return;
      void loadClientRef(value, registry)
        .then((fn) => {
          if (disposed) return;
          if (typeof fn !== "function")
            throw new Error("tenoncms: field description MUST export a function");
          callback.value = fn as FieldDescription;
        })
        .catch((error) => {
          if (!disposed)
            loadError.value = error instanceof Error ? error : new Error(String(error));
        });
    },
    { immediate: true },
  );

  return computed((): { text?: Text; error?: Error } => {
    if (loadError.value) return { error: loadError.value };
    try {
      const value = source();
      const fn = typeof value === "function" ? value : callback.value;
      const result = fn ? fn(context()) : isRef(value) ? undefined : value;
      if (result == null || result === "") return {};
      if (!isText(result))
        throw new Error("tenoncms: field description MUST return text synchronously");
      return { text: result };
    } catch (error) {
      return { error: error instanceof Error ? error : new Error(String(error)) };
    }
  });
}
