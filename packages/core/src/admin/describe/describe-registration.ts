import type { FieldDescriptor, PageDescriptor } from "../index";
import { copyConfig, isObject, optionalLoad, requireRef } from "./registration-checks.ts";

/**
 * Checks a field registration.
 * @returns Its descriptor and its loader.
 */
export function describeField(key: string, value: unknown, source: string) {
  return describeEntry<FieldDescriptor>("fields", key, value, source);
}

/**
 * Checks a page registration. `pageHeader` MUST be a boolean, an array of crumbs or a `clientRef()`.
 * @returns Its descriptor and its loader.
 */
export function describePage(key: string, value: unknown, source: string) {
  return describeEntry<PageDescriptor>("pages", key, value, source, (entry, path) => {
    const { pageHeader } = entry;
    if (pageHeader !== undefined && typeof pageHeader !== "boolean" && !Array.isArray(pageHeader))
      requireRef(pageHeader, `${path}.pageHeader`, source);
  });
}

// A field and a page share one shape: a browser `mount` and an optional server `load`.
function describeEntry<D extends { load?: true }>(
  kind: "fields" | "pages",
  key: string,
  value: unknown,
  source: string,
  extraCheck?: (entry: Record<string, any>, path: string) => void,
) {
  const path = `admin.${kind}.${key}`;
  const where = `${path} in ${source}`;
  if (!isObject(value)) throw new Error(`tenoncms: ${where} MUST be an object`);

  const { mount, load: fn, ...rest } = value;
  requireRef(mount, `${path}.mount`, source);
  extraCheck?.(value, path);

  const descriptor = copyConfig({ ...rest, mount }, where) as unknown as D;
  const loader = optionalLoad(fn, path, source);
  if (loader) descriptor.load = true;
  return { descriptor, loader };
}
