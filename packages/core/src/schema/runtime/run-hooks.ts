import { type Slot } from "../hooks/index.ts";

/** The hooks of a slot in order. A record keeps its key order. */
export const hookList = <F>(slot?: Slot<F>) =>
  Array.isArray(slot) ? slot : Object.values(slot ?? {});

/**
 * Runs the hooks of a slot in order. A hook MAY return a replacement for the value under `key`; `undefined` keeps it.
 * @returns The value after the last hook.
 */
export async function runHooks<V>(
  slot: Slot<any> | undefined,
  key: string,
  value: V,
  args: object,
): Promise<V> {
  for (const fn of hookList(slot)) {
    const result = await fn({ ...args, [key]: value });
    if (result !== undefined) value = result;
  }
  return value;
}
