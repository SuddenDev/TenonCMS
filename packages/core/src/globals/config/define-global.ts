import type { Fields } from "../../schema/fields/index.ts";
import type { GlobalHooks } from "../../schema/hooks/index.ts";
import type { Global } from "./types.ts";

/**
 * Defines a global with hook data types inferred from its fields.
 *
 * @param global Global configuration, including fields and optional hooks.
 * @returns A shallow copy with an empty hooks object when hooks are omitted.
 */
export function defineGlobal<
  const F extends Fields,
  const T extends Omit<Global<F>, "fields" | "hooks">,
  const H extends GlobalHooks<NoInfer<F>>,
>(global: T & { fields: F; hooks?: H }): T & { fields: F; hooks: H } {
  return { ...global, hooks: global.hooks ?? ({} as H) };
}
