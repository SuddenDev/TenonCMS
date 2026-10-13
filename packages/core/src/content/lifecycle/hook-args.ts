import { type Inner } from "../../cms/runtime/types.ts";
import { type Name } from "../targets.ts";

/**
 * Builds the arguments of a hook call.
 * @returns The arguments every hook gets, plus `extra`.
 */
export function hookArgs<E extends object>(s: Inner, name: Name, extra: E) {
  return {
    cms: s.cms,
    user: s.user,
    context: s.context,
    [name.kind]: name.name,
    draft: false,
    locale: s.locale,
    ...extra,
  };
}
