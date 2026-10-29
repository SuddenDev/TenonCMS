import type { ClientRef, Mount, MountHandle } from "../index.d.ts";

/** Browser exports found in the server configuration, by `clientRef()` specifier. */
export type ClientRegistry = Record<string, () => Promise<unknown>>;

/** Resolves a discovered browser export. Missing references fail with the original specifier. */
export async function loadClientRef<T>(ref: ClientRef<T>, registry: ClientRegistry): Promise<T> {
  const load = Object.hasOwn(registry, ref.clientRef) && registry[ref.clientRef];
  if (!load)
    throw new Error(
      `tenoncms: clientRef("${ref.clientRef}") was not discovered. Use a literal clientRef() call in the static configuration import graph.`,
    );
  const value = await load();
  if (value === undefined)
    throw new Error(`tenoncms: missing export in clientRef("${ref.clientRef}")`);
  return value as T;
}

/**
 * Keeps updates and cleanup correct while a reference-backed mount loads.
 * With `gate`, the first mount also waits for it, e.g. for server data. Updates that arrive before the
 * mount runs replace the initial context.
 */
export function lazyMount<Ctx>(load: () => Promise<unknown>, gate?: Promise<unknown>): Mount<Ctx> {
  return (el, initial) => {
    let current = initial;
    let disposed = false;
    let handle: MountHandle<Ctx> | undefined;
    const code = gate ? Promise.all([load(), gate]).then(([mount]) => mount) : load();
    void code
      .then((mount) => {
        if (disposed) return;
        if (typeof mount !== "function")
          throw new Error("tenoncms: clientRef MUST export a mount function");
        const result = mount(el, current);
        handle = typeof result === "function" ? { unmount: result } : result;
      })
      .catch((error) => {
        if (!disposed) showError(el, error);
      });
    return {
      update(ctx) {
        current = ctx;
        handle?.update?.(ctx);
      },
      unmount() {
        disposed = true;
        handle?.unmount();
        el.replaceChildren();
      },
    };
  };
}

function showError(el: HTMLElement, error: unknown) {
  const message = document.createElement("p");
  message.setAttribute("role", "alert");
  message.textContent = error instanceof Error ? error.message : "Admin extension failed to load";
  el.replaceChildren(message);
}
