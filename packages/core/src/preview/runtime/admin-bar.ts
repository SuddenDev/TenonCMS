import type {
  AdminBarContext,
  AdminBarItem,
  MountHandle,
  ServerAdminBarItem,
} from "../../admin/index.d.ts";
import type { Unsubscribe } from "../config/types.ts";
import { builtIns, composeItems, getAddedItems, subscribeItems } from "./admin-bar-items.ts";
import { boundDocuments } from "./bind-elements.ts";
import {
  clearSessionHint,
  loadAdminBar,
  perspective,
  setPerspective,
  type AdminBarData,
} from "./site-api.ts";

type Mode = AdminBarContext["mode"];
type Bound = { collection: string; id: string };

/** A running admin bar. */
export type AdminBar = {
  /** Unmounts the bar. Safe before it has loaded. */
  stop: Unsubscribe;
  /** Scans the page for bound documents again and updates the `edit` item when they changed. */
  refresh: () => void;
  /** Shows the edit mode in the bar's switch. */
  setEdit: (edit: boolean) => void;
};

/**
 * Loads the admin bar's items for the page and mounts the bar in a shadow root on `<html>`. Without a session it
 * clears the session hint and shows nothing.
 * @param admin Path of the admin, for the links.
 * @param onEdit Called when the user flips the edit switch of a preview tab.
 */
export function startAdminBar(
  mode: Mode,
  admin: string,
  onEdit: (edit: boolean) => void = () => {},
): AdminBar {
  let data: AdminBarData | undefined;
  let documents = boundDocuments();
  let edit = false;
  let handle: Required<MountHandle<AdminBarContext>> | undefined;
  let host: HTMLElement | undefined;
  let stopped = false;

  const context = (): AdminBarContext => ({
    position: data!.position,
    mode,
    items: composeItems(fillItems(data!.items, { mode, admin, documents }), getAddedItems()),
    perspective: perspective(),
    edit,
    setPerspective,
    setEdit: onEdit,
  });
  const render = () => handle?.update(context());

  const refresh = () => {
    const next = boundDocuments();
    if (JSON.stringify(next) === JSON.stringify(documents)) return;
    documents = next;
    render();
  };

  const mount = async () => {
    const loaded = await loadAdminBar(location.href);
    if (loaded === "unauthorized") clearSessionHint();
    if (!loaded || loaded === "unauthorized" || stopped) return;
    data = loaded;

    try {
      const { mountAdminBar } = await import("integral-cms/admin/bar");
      if (stopped) return;
      // On `<html>`, outside `<body>`, so a morph or a framework render keeps it.
      host = document.createElement("div");
      host.setAttribute("data-cms-bar", "");
      // The bar and its menus stack inside the host, above everything on the page.
      host.style.cssText = "position:relative;z-index:2147483647";
      document.documentElement.append(host);
      handle = mountAdminBar(host.attachShadow({ mode: "open" }), context());
    } catch (e) {
      host?.remove();
      console.warn("[integral] The admin bar failed to load.", e);
    }
  };

  const unsubscribe = subscribeItems(render);
  document.addEventListener("DOMContentLoaded", refresh);
  void mount();

  return {
    stop: () => {
      stopped = true;
      unsubscribe();
      document.removeEventListener("DOMContentLoaded", refresh);
      handle?.unmount();
      host?.remove();
    },
    refresh,
    setEdit: (next) => {
      if (next === edit) return;
      edit = next;
      render();
    },
  };
}

/**
 * Turns the server's built-in stubs into items for the page. Stubs keep their `group`, `order` and a label a hook
 * set. Unknown items pass through. A preview tab gets `exit-preview`.
 */
export function fillItems(
  stubs: ServerAdminBarItem[],
  { mode, admin, documents }: { mode: Mode; admin: string; documents: Bound[] },
): AdminBarItem[] {
  const items: AdminBarItem[] = [];
  for (const stub of stubs) {
    if (stub.id === "dashboard") items.push({ ...stub, href: admin });
    else if (stub.id === "edit") {
      const item = editItem(stub, admin, documents);
      if (item) items.push(item);
    } else if (stub.id === "live-edit" && mode === "site")
      items.push({
        ...stub,
        href: `${admin}/presentation?url=${encodeURIComponent(location.href)}`,
      });
    else items.push(stub);
  }

  // The server does not know the page is a preview tab, so `exit-preview` is added here.
  if (mode === "preview-tab") {
    const exit = builtIns(mode).find((i) => i.id === "exit-preview")!;
    items.push({ ...exit, onClick: exitPreview });
  }
  return items;
}

// One document: a link. Several: a dropdown with one link each. None: no item.
function editItem(stub: ServerAdminBarItem, admin: string, documents: Bound[]) {
  const links = documents.map(({ collection, id }) => ({
    id: `edit:${collection}:${id}`,
    label: `Edit ${collection}`,
    href: `${admin}/content/${id ? `collections/${collection}/${id}` : `globals/${collection}`}`,
  }));
  if (!links.length) return undefined;
  if (links.length > 1) return { ...stub, children: links };

  const relabelled = stub.label !== builtIns("site").find((i) => i.id === "edit")!.label;
  return { ...stub, label: relabelled ? stub.label : links[0]!.label, href: links[0]!.href };
}

function exitPreview() {
  window.name = "";
  location.reload();
}
