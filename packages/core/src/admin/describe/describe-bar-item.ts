import type { AdminBarItemDescriptor } from "../index.d.ts";
import {
  isText,
  copyConfig,
  isObject,
  optionalLoad,
  requireRef,
  type Loader,
} from "./registration-checks.ts";

export type DescribedItem = {
  descriptor: AdminBarItemDescriptor;
  /** Loaders of the item and its children, by id. */
  loaders: [string, Loader<never>][];
};

/**
 * Checks a bar item registration and splits its `load` from the JSON descriptor.
 * @param id The key of the item in `items` or `children`.
 * @param child A dropdown child. It MUST NOT have `children`.
 * @returns The descriptor and the loaders of the item and its children.
 */
export function describeBarItem(
  id: string,
  value: unknown,
  source: string,
  child = false,
): DescribedItem {
  const where = `admin bar item "${id}" in ${source}`;

  if (!isObject(value))
    throw new Error(`tenoncms: ${where} MUST be an object${child ? "" : " or false"}`);
  if (!isText(value.label)) throw new Error(`tenoncms: ${where} MUST have a label`);

  const { label, icon, order, href, onClick, mount, children } = value;
  checkCombination(value, id, where, source);

  const fn = optionalLoad(value.load, `admin bar item "${id}"`, source);
  const descriptor: AdminBarItemDescriptor = copyConfig(
    { id, label, icon, order, href, onClick, mount },
    where,
  );
  const loaders: DescribedItem["loaders"] = fn ? [[id, { source, load: fn }]] : [];
  if (fn) descriptor.load = true;

  if (children !== undefined) {
    if (child) throw new Error(`tenoncms: ${where}: children cannot have children`);
    const described = describeChildren(children, source, where);
    descriptor.children = described.map((d) => d.descriptor);
    for (const d of described) loaders.push(...d.loaders);
  }
  return { descriptor, loaders };
}

// A bar item is a link, a dropdown, a button or a custom control. Never a mix.
function checkCombination(value: Record<string, any>, id: string, where: string, source: string) {
  const { href, onClick, mount, children } = value;
  if (onClick !== undefined) requireRef(onClick, `admin bar item "${id}" onClick`, source);
  if (mount !== undefined) requireRef(mount, `admin bar item "${id}" mount`, source);
  if (mount && (href !== undefined || onClick !== undefined || children !== undefined))
    throw new Error(`tenoncms: ${where}: mount cannot be combined with href, onClick or children`);
  if (onClick && (href !== undefined || children !== undefined))
    throw new Error(`tenoncms: ${where}: onClick cannot be combined with href or children`);
}

function describeChildren(children: unknown, source: string, where: string) {
  if (!isObject(children))
    throw new Error(`tenoncms: ${where}: children MUST be an object of items by id`);
  return Object.entries(children).map(([id, entry]) => describeBarItem(id, entry, source, true));
}
