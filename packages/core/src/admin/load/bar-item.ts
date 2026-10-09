import { consola } from "consola";
import type { AdminBarItemDescriptor, BarItemLoadContext, Json } from "../index.d.ts";
import type { Loader } from "../describe/registration-checks.ts";
import { keepsChildren, resolveBarItem, type ResolvedBarItem } from "./resolve-bar-item.ts";
import { toJson } from "./to-json.ts";

/** Returned by {@link loadBarItem} when the loader of an item threw or returned something invalid. */
export const FAILED = Symbol("integral.barItemFailed");

type Loaders = Map<string, Loader<BarItemLoadContext>>;
type Applied = { resolved: ResolvedBarItem | null; loaded: Json | undefined };

/**
 * Runs the loader of one bar item and, unless the result replaces the children, the loaders of its registered
 * children. It never runs another item's loader. Both `/admin-bar` and `POST /admin/load` use it.
 * @param item An effective item descriptor, or a child of one.
 * @param loaders The loaders of the bar by item id. An item without one resolves as registered.
 * @param options `rethrow` passes the error of a throwing loader on, so the HTTP error handler can map it.
 * @returns The resolved item, `null` when it is hidden, or {@link FAILED} for invalid output or, without
 * `rethrow`, a throwing loader. Failures are logged. A child that fails or hides is left out.
 */
export async function loadBarItem(
  item: AdminBarItemDescriptor,
  loaders: Loaders,
  ctx: BarItemLoadContext,
  { rethrow = false } = {},
): Promise<ResolvedBarItem | null | typeof FAILED> {
  if (item.hidden) return null;

  const loader = item.load ? loaders.get(item.id) : undefined;
  const run: Applied | typeof FAILED = loader
    ? await applyLoader(item, loader, ctx, rethrow)
    : { resolved: resolveBarItem(item, undefined), loaded: undefined };
  if (run === FAILED) return FAILED;

  const { resolved, loaded } = run;
  if (!resolved || !item.children?.some((c) => c.load) || !keepsChildren(item, loaded))
    return resolved;
  resolved.children = await loadChildren(item.children, loaders, ctx, rethrow);
  return resolved;
}

// Runs one loader and lays its result over the item. Failures are logged with the loader's source.
async function applyLoader(
  item: AdminBarItemDescriptor,
  loader: Loader<BarItemLoadContext>,
  ctx: BarItemLoadContext,
  rethrow: boolean,
): Promise<Applied | typeof FAILED> {
  const fail = (e: unknown): typeof FAILED => {
    consola
      .withTag("integral")
      .error(`admin bar item "${item.id}" in ${loader.source}: load failed`, e);
    return FAILED;
  };

  let raw: unknown;
  try {
    raw = await loader.load(ctx);
  } catch (e) {
    if (rethrow) throw e;
    return fail(e);
  }
  try {
    const loaded: Json = toJson(raw, "result");
    return { loaded, resolved: resolveBarItem(item, loaded) };
  } catch (e) {
    return fail(e);
  }
}

async function loadChildren(
  children: AdminBarItemDescriptor[],
  loaders: Loaders,
  ctx: BarItemLoadContext,
  rethrow: boolean,
) {
  const loaded = await Promise.all(
    children.map((child) => loadBarItem(child, loaders, ctx, { rethrow })),
  );
  return loaded.filter((c): c is ResolvedBarItem => !!c && c !== FAILED);
}
