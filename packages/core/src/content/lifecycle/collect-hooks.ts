import { type Core, type Stage } from "../../cms/runtime/types.ts";
import { type Name, target, isMedia } from "../targets.ts";
import { type RootHooks } from "../../schema/index.ts";
import { list } from "../../schema/runtime/run-hooks.ts";

/** The hooks of a stage: the collection's or global's, then the plugins', then the host's root hooks. None for `media`. */
export const slot = (core: Core, name: Name, stage: Stage): ((args: any) => unknown)[] =>
  isMedia(name)
    ? []
    : [
        ...list<(args: any) => unknown>(
          (target(core, name).hooks as RootHooks | undefined)?.[stage],
        ),
        ...core.plugins.flatMap((p) => list<(args: any) => unknown>(p.hooks?.[stage])),
        ...list<(args: any) => unknown>(core.rootHooks[stage]),
      ];
