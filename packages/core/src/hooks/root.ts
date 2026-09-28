import type { Fields } from "../fields/index.ts";
import type { CollectionHooks } from "./collection.ts";

/**
 * Hooks of `defineCms` and of plugins. They run for every collection and global, after the collection's or
 * global's own hooks of the same stage. `collection` or `global` names the target; `data`, `doc` and `docs` are untyped.
 * Globals run only the stages of {@link GlobalHooks}.
 */
export type RootHooks = CollectionHooks<Fields>;
