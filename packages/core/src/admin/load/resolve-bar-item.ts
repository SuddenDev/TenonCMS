import { z } from "zod";
import type { AdminBarItemDescriptor, AdminBarItemOverrides, Json } from "../index.d.ts";

/** An admin bar item for one request: the registered item with the result of its `load` applied. */
export type ResolvedBarItem = Omit<AdminBarItemDescriptor, "load" | "hidden" | "children"> & {
  /** The result of `load` for an item with `onClick` or `mount`. Absent without a `load`. */
  data?: Json;
  /** Internal. Set by core on its built-in stubs only, never from a registration or a loader result. */
  builtIn?: true;
  children?: ResolvedBarItem[];
};

const text = z.string().min(1);
// What the `load` of a link or dropdown item may return. Unknown keys fail, so `id`, `order` and refs stay fixed.
const overrides = z
  .strictObject({
    label: text.optional(),
    icon: z.string().optional(),
    href: z.string().optional(),
    children: z
      .record(
        text,
        z.strictObject({
          label: text,
          icon: z.string().optional(),
          href: z.string().optional(),
          order: z.number().optional(),
        }),
      )
      .optional(),
  })
  .nullable();

// A link or dropdown. Its `load` returns overrides. Other items get the result as `data`.
const isNative = (item: AdminBarItemDescriptor) => !item.onClick && !item.mount;

// The item as the browser gets it: without the `load` flag, children included.
function plain({ load: _load, hidden: _hidden, children, ...rest }: AdminBarItemDescriptor) {
  const item: ResolvedBarItem = rest;
  if (children) item.children = children.map(plain);
  return item;
}

/**
 * Applies the result of an item's `load` to the registered item. `id`, `order` and the browser references never
 * come from the loader.
 * - Link or dropdown: `loaded` is `null` (hide) or `{ label?, icon?, href?, children? }`, laid over the item.
 * - Button or custom control: `loaded` becomes `data`. `null` is data and does not hide the item.
 * @param loaded A JSON result, or `undefined` when the item has no `load`.
 * @returns The resolved item, or `null` when the item is hidden for this request.
 * @throws If a link or dropdown got anything else than the allowed keys.
 */
export function resolveBarItem(item: AdminBarItemDescriptor, loaded: Json | undefined) {
  const resolved = plain(item);
  if (loaded === undefined) return resolved;
  if (!isNative(item)) return { ...resolved, data: loaded };
  const changes = overrides.parse(loaded) as AdminBarItemOverrides | null;
  if (!changes) return null;
  const { children, ...rest } = changes;
  return {
    ...resolved,
    ...rest,
    ...(children && {
      children: Object.entries(children).map(([id, child]) => ({ id, ...child })),
    }),
  };
}

/**
 * Whether the registered children keep running their own loaders. A link or dropdown whose result replaces
 * `children` brings plain data instead.
 */
export function keepsChildren(item: AdminBarItemDescriptor, loaded: Json | undefined) {
  return !(
    isNative(item) &&
    loaded &&
    typeof loaded === "object" &&
    !Array.isArray(loaded) &&
    loaded.children !== undefined
  );
}
