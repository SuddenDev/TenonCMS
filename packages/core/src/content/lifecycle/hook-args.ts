import { type Inner } from "../../cms/runtime/types.ts";
import { type Name } from "../targets.ts";

/** The arguments every hook gets, plus `extra`. */
export const hookArgs = <E extends object>(s: Inner, name: Name, extra: E) => ({
  cms: s.cms,
  user: s.user,
  context: s.context,
  [name.kind]: name.name,
  draft: false,
  ...extra,
});
