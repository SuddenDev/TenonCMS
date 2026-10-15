import type { User } from "better-auth";
import { HTTPException } from "hono/http-exception";
import type { Core } from "../../cms/runtime/types.ts";
import { notFound } from "../../http/errors.ts";
import type { LocalApi } from "../../schema/index.ts";
import type { AdminBarItemDescriptor } from "../index.d.ts";
import { FAILED, loadBarItem } from "./bar-item.ts";
import { fieldTarget } from "./field-target.ts";
import type { LoadRequest } from "./load-request.ts";
import { runLoader } from "./run-loader.ts";

type Request<K extends LoadRequest["kind"]> = Extract<LoadRequest, { kind: K }>;

/**
 * Runs the one loader a request selects. Lookups go through the instance's maps, so request keys never reach an
 * object's prototype. Nothing runs before the request is checked.
 * @param cms The local API with the caller's user and perspective.
 * @returns `{ data }` for a field or page, `{ item }` for a bar item, which is `null` when the item is hidden.
 * @throws 404 for an unknown registration or one without a `load`, 400 for a field mismatch, 500 for a bar item
 * that fails. Errors from the loader itself pass through.
 */
export async function load(core: Core, request: LoadRequest, user: User, cms: LocalApi) {
  switch (request.kind) {
    case "field":
      return loadField(core, request, user, cms);
    case "page":
      return loadPage(core, request, user, cms);
    case "bar-item":
      return loadItem(core, request, user, cms);
  }
}

async function loadField(core: Core, request: Request<"field">, user: User, cms: LocalApi) {
  const loader = registered(core.admin.fieldLoaders, request.type);
  const field = await fieldTarget(core, cms, request);
  const { path, owner, locale } = request;
  const data = await runLoader(
    loader,
    { user, cms, locale, field, path, owner },
    `admin field "${request.type}"`,
  );
  return { data };
}

async function loadPage(core: Core, request: Request<"page">, user: User, cms: LocalApi) {
  const loader = registered(core.admin.pageLoaders, request.key);
  const { params, query, locale } = request;
  const data = await runLoader(
    loader,
    { user, cms, locale, params, query },
    `admin page "${request.key}"`,
  );
  return { data };
}

async function loadItem(core: Core, request: Request<"bar-item">, user: User, cms: LocalApi) {
  const { bar } = core.admin;
  if (!bar) throw notFound();
  const item = findItem(bar.items, request.id);
  if (!item?.load || !bar.loaders.has(item.id)) throw notFound();

  const ctx = { user, cms, locale: request.locale, url: request.url };
  const resolved = await loadBarItem(item, bar.loaders, ctx, { rethrow: true });
  if (resolved === FAILED) throw new HTTPException(500, { message: "Internal Server Error" });
  return { item: resolved };
}

// A request key selects a registration. An unknown key is a 404.
function registered<T>(loaders: Map<string, T>, key: string) {
  const loader = loaders.get(key);
  if (!loader) throw notFound();
  return loader;
}

// The effective item with this id, a child of a dropdown included.
function findItem(items: AdminBarItemDescriptor[], id: string) {
  for (const item of items) {
    if (item.id === id) return item;
    const child = item.children?.find((c) => c.id === id);
    if (child) return child;
  }
}
