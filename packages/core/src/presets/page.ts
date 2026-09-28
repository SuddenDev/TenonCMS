// Presets run in browser bundles too, so this file MUST NOT import zod or server code.
import type { Fields } from "../schema/index.ts";
import { nestedPaths } from "./nested-paths.ts";

/**
 * Pages with nested URLs. Spread `page.fields` into a collection's fields and use `page.hooks` stage by stage.
 * `parent` points to `pages`; for another collection name, override it: `parent: { ...page.fields.parent, collection: 'docs' }`.
 */
export const page = {
  fields: {
    title: { type: "text", required: true },
    slug: { type: "slug", from: "title", parent: "parent", path: "path", required: true },
    // `restrict`: a page with children cannot be deleted, so no subtree is lost.
    parent: { type: "relation", collection: "pages", onDelete: "restrict" },
    path: { type: "text", readOnly: true },
  },
  hooks: nestedPaths(),
} as const satisfies { fields: Fields; hooks: object };
