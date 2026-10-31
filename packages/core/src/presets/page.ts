// Presets run in browser bundles too, so this file MUST NOT import zod or server code.
import type { Fields } from "../schema/index.ts";
import { nestedPaths } from "./nested-paths.ts";

/**
 * Pages with nested URLs. Spread `fields` into a collection's fields and use `hooks` stage by stage. `permalink` is the
 * URL of a page, its `path`.
 * @param options.collection The collection the pages live in, which `parent` points to. Default `'pages'`.
 */
export function page<const C extends string = "pages">(options: { collection?: C } = {}) {
  return {
    fields: {
      title: { type: "text", required: true },
      slug: { type: "slug", from: "title", parent: "parent", path: "path", required: true },
      // `restrict`: a page with children cannot be deleted, so no subtree is lost.
      parent: {
        type: "relation",
        collection: (options.collection ?? "pages") as C,
        onDelete: "restrict",
      },
      path: { type: "text", readOnly: true },
    },
    hooks: nestedPaths(),
    permalink: "{path}",
  } as const satisfies { fields: Fields; hooks: object; permalink: string };
}
