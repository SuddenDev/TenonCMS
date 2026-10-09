import type {
  AdminBarContext,
  AdminBarItem,
  AdminBarItemContext,
  Json,
  MountHandle,
} from "../../admin/index.d.ts";
import { lazyMount, loadClientRef } from "../../admin/browser/lazy-mount.ts";
import type { ResolvedBarItem } from "../../admin/load/resolve-bar-item.ts";
import type { Unsubscribe } from "../config/types.ts";
import {
  clearSessionHint,
  loadAdminBar,
  loadAdminBarItem,
  perspective,
  setPerspective,
  type AdminBarData,
} from "./site-api.ts";

type Mode = AdminBarContext["mode"];

/** A running admin bar. */
export type AdminBar = {
  /** Unmounts the bar. Safe before it has loaded. */
  stop: Unsubscribe;
  /** Shows the edit mode in the bar's switch. */
  setEdit: (edit: boolean) => void;
};

// Path and query: what the CMS gets as the page `url`.
const page = () => location.pathname + location.search;

/**
 * Loads the admin bar's items for the page and mounts the bar in a shadow root on `<html>`. Without a session it
 * clears the session hint and shows nothing.
 *
 * The items come from the CMS: `mode` selects the normal items or the fixed preview controls. The browser code
 * of an item (`onClick`, `mount`) loads only after the CMS confirmed the session. The items load again when the
 * page's path or query changes and when the window gets focus. Edit mode, scrolling and DOM changes only
 * update the context.
 * @param admin Path of the admin, for the links.
 * @param onEdit Called when the user flips the edit switch of a preview tab.
 */
export function startAdminBar(
  mode: Mode,
  admin: string,
  onEdit: (edit: boolean) => void = () => {},
  {
    onSessionEnd = () => {},
    onExit = () => {},
  }: {
    onSessionEnd?: () => void;
    onExit?: () => void;
  } = {},
): AdminBar {
  let answer: Pick<AdminBarData, "position" | "branding"> | undefined;
  let items: AdminBarItem[] = [];
  // The server data of every item and dropdown child, by id.
  const data = new Map<string, Json | undefined>();
  let href = location.href;
  let lastPage = page();
  let edit = false;
  let handle: Required<MountHandle<AdminBarContext>> | undefined;
  let mounting: Promise<void> | undefined;
  let host: HTMLElement | undefined;
  let stopped = false;
  // Counts full loads. A response that finds a newer number is stale.
  let generation = 0;
  // The latest reload of each item. An older one is stale.
  const reloads = new Map<string, object>();
  let registry: ReturnType<typeof loadRegistry> | undefined;

  const context = (): AdminBarContext => ({
    position: answer!.position,
    name: answer!.branding?.name,
    logo: answer!.branding?.logo,
    icon: answer!.branding?.icon,
    dismiss: () => {
      if (mode === "preview-tab") {
        onExit();
        mode = "site";
        edit = false;
        items = [];
        data.clear();
        render();
        void load();
        return;
      }
      onEdit(false);
      if (host) {
        host.hidden = true;
        host.style.display = "none";
      }
    },
    mode,
    items: fillItems(items, { admin }),
    perspective: perspective(),
    edit,
    setPerspective,
    setEdit: onEdit,
  });
  const render = () => {
    if (handle && answer) handle.update(context());
  };

  // What a handler or mount of one item gets: the bar context, its own data and a reload scoped to it.
  const itemContext = (id: string, bar = context()): AdminBarItemContext<any> => ({
    ...bar,
    data: data.get(id),
    integral: { reload: () => reload(id) },
  });

  async function toItem(served: ResolvedBarItem): Promise<AdminBarItem | null> {
    const { children, data: _data, onClick, mount, ...rest } = served;
    const item = rest as AdminBarItem;
    try {
      if (onClick) {
        const handler = await loadClientRef(onClick, await (registry ??= loadRegistry()));
        item.onClick = () => handler(itemContext(served.id));
      }
      if (mount) {
        const mounted = await loadClientRef(mount, await (registry ??= loadRegistry()));
        item.mount = (el, bar) => {
          const lazy = lazyMount<AdminBarItemContext<any>>(async () => mounted)(
            el,
            itemContext(served.id, bar),
          ) as MountHandle<AdminBarItemContext<any>>;
          return {
            update: (next) => lazy.update?.(itemContext(served.id, next)),
            unmount: () => lazy.unmount(),
          };
        };
      }
      if (children) {
        const kids = await Promise.all(children.map(toItem));
        item.children = kids.filter((kid) => !!kid);
      }
    } catch (error) {
      console.error(`[integral] The admin bar item "${served.id}" failed to load.`, error);
      return null;
    }
    return item;
  }
  const convert = async (served: ResolvedBarItem[]) =>
    (await Promise.all(served.map(toItem))).filter((item) => !!item);

  const endSession = () => {
    clearSessionHint();
    onSessionEnd();
    cleanup();
  };

  // Asks for the items of the page, then shows them. Resolves to whether this load was applied.
  async function load() {
    const current = ++generation;
    const asked = mode;
    const loaded = await loadAdminBar(page(), asked);
    if (stopped || current !== generation) return;
    if (loaded === "unauthorized") return endSession();
    if (!loaded) return;
    const next = await convert(loaded.items);
    if (stopped || current !== generation) return;

    answer = { position: loaded.position, branding: loaded.branding };
    items = next;
    data.clear();
    storeData(loaded.items);
    reloads.clear();
    show();
  }

  function storeData(served: ResolvedBarItem[]) {
    for (const item of served) {
      data.set(item.id, item.data);
      storeData(item.children ?? []);
    }
  }

  // Runs the server `load` of one item again and replaces just that item.
  async function reload(id: string) {
    const current = generation;
    const token = {};
    reloads.set(id, token);
    const loaded = await loadAdminBarItem(id, page());
    const fresh = () => !stopped && current === generation && reloads.get(id) === token;
    if (!fresh()) return;
    if (loaded === "unauthorized") return endSession();
    const next = loaded.item && (await toItem(loaded.item));
    if (!fresh()) return;

    forget(find(items, id));
    if (loaded.item) storeData([loaded.item]);
    items = replace(items, id, next);
    render();
  }
  const forget = (item: AdminBarItem | undefined) => {
    if (!item) return;
    data.delete(item.id);
    item.children?.forEach(forget);
  };

  // The first answer mounts the bar. Later ones update it.
  function show() {
    if (handle) return render();
    mounting ??= (async () => {
      const { mountAdminBar } = await import("integral-cms/admin/bar");
      if (stopped) return;
      // On `<html>`, outside `<body>`, so a morph or a framework render keeps it.
      host = document.createElement("div");
      host.setAttribute("data-cms-bar", "");
      // The bar and its menus stack inside the host, above everything on the page.
      host.style.cssText = "position:relative;z-index:2147483647";
      document.documentElement.append(host);
      handle = mountAdminBar(host.attachShadow({ mode: "open" }), context());
    })().catch((e) => {
      host?.remove();
      console.warn("[integral] The admin bar failed to load.", e);
    });
  }

  // Local context changes: the address and the Edit link. The CMS is asked again only for a new path or query.
  const check = () => {
    if (location.href === href) return;
    href = location.href;
    render();
    const moved = page() !== lastPage;
    lastPage = page();
    if (moved && mode === "site") void load();
  };
  const observer = new MutationObserver(check);
  const recheck = () => void load();

  const cleanup = () => {
    if (stopped) return;
    stopped = true;
    observer.disconnect();
    document.removeEventListener("DOMContentLoaded", check);
    window.removeEventListener("popstate", check);
    window.removeEventListener("hashchange", check);
    window.removeEventListener("focus", recheck);
    handle?.unmount();
    host?.remove();
  };
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
  });
  document.addEventListener("DOMContentLoaded", check);
  window.addEventListener("popstate", check);
  window.addEventListener("hashchange", check);
  window.addEventListener("focus", recheck);
  void load();

  return {
    stop: cleanup,
    setEdit: (next) => {
      if (next === edit) return;
      edit = next;
      render();
    },
  };
}

// The registry of discovered browser exports. Loads on the first item that has a reference.
const loadRegistry = () => import("#integral/client-registry").then((m) => m.default);

// The item with this id, a dropdown child included.
function find(list: AdminBarItem[], id: string): AdminBarItem | undefined {
  for (const item of list) {
    if (item.id === id) return item;
    const child = item.children && find(item.children, id);
    if (child) return child;
  }
}

// Replaces the item with this id, or removes it for `null`. Position stays.
function replace(list: AdminBarItem[], id: string, next: AdminBarItem | null): AdminBarItem[] {
  return list.flatMap((item) => {
    if (item.id === id) return next ? [next] : [];
    if (!item.children) return [item];
    return [{ ...item, children: replace(item.children, id, next) }];
  });
}

/**
 * Fills the links of the built-in `dashboard` and `edit` stubs. An item that replaced a built-in by id has no
 * `builtIn` marker and stays as it is. Other items pass through.
 */
export function fillItems(items: AdminBarItem[], { admin }: { admin: string }): AdminBarItem[] {
  return items.map((item) => {
    if (!(item as { builtIn?: true }).builtIn) return item;
    if (item.id === "dashboard") return { ...item, href: admin };
    if (item.id === "edit")
      return { ...item, href: `${admin}/presentation?url=${encodeURIComponent(location.href)}` };
    return item;
  });
}
