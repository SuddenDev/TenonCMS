import { type Core, type Stage } from "../../cms/runtime/types.ts";
import { type Name, target, isMedia } from "../targets.ts";
import { type RootHooks } from "../../schema/index.ts";
import { hookList } from "../../schema/runtime/run-hooks.ts";

type Hook = (args: any) => unknown;

/**
 * Collects the hooks of one stage in run order: the collection's or global's, then the plugins', then the host's root hooks.
 * @returns The hooks of the stage. None for `media`.
 */
export function slot(core: Core, name: Name, stage: Stage): Hook[] {
  if (isMedia(name)) return [];

  const own = (target(core, name).hooks as RootHooks | undefined)?.[stage];
  return [
    ...hookList<Hook>(own),
    ...core.plugins.flatMap((p) => hookList<Hook>(p.hooks?.[stage])),
    ...hookList<Hook>(core.rootHooks[stage]),
  ];
}
