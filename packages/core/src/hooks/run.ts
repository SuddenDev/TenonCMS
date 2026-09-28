import type { Slot } from "./index.ts";

export const list = <F>(slot?: Slot<F>) => (Array.isArray(slot) ? slot : Object.values(slot ?? {}));

/** Runs the hooks of a slot in order. A hook MAY return a replacement for the value under `key`; `undefined` keeps it. */
export async function runHooks<V>(
  slot: Slot<any> | undefined,
  key: string,
  value: V,
  args: object,
): Promise<V> {
  for (const fn of list(slot)) {
    const result = await fn({ ...args, [key]: value });
    if (result !== undefined) value = result;
  }
  return value;
}
