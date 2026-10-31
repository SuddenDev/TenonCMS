// Presets run in browser bundles too, so this file MUST NOT import zod or server code.
import { ValidationError } from "../errors.ts";
import type { LocalApi } from "../schema/index.ts";

/** Field names the `nestedPaths()` hooks read and write. Each defaults to the name in `page().fields`. */
export type NestedPathsOptions = {
  /** The `slug` field. Default `'slug'`. */
  slug?: string;
  /** The `relation` field that points to the parent document in the same collection. Default `'parent'`. */
  parent?: string;
  /** The stored path, e.g. `/about/team`. The slug field's `path` option MUST name it too, so the admin shows it as the prefix. Default `'path'`. */
  path?: string;
};

// Presets fit any collection, so data is untyped. Collection hooks always get `collection`.
type Args = { data: any; id?: string; collection?: string; cms: LocalApi };

/**
 * Hooks for documents under a parent document of the same collection, with a URL path that follows the tree:
 * - `validParent` rejects a parent that is the document itself or one of its descendants.
 * - `buildPath` stores the path from the parent's path and the slug, e.g. `/about/team`.
 * - `uniquePath` rejects a path another document has.
 * - `updateChildPaths` updates the paths below a document when its path changes.
 *
 * They are named records, so a host can leave one out by name: `const { uniquePath, ...beforeChange } = page().hooks.beforeChange`.
 * Nesting without paths keeps only `validParent`. All run in the write's transaction, so two parallel saves cannot claim the same path.
 */
export function nestedPaths({
  slug = "slug",
  parent = "parent",
  path = "path",
}: NestedPathsOptions = {}) {
  return {
    beforeChange: {
      /** Rejects a parent that is the document itself or one of its descendants. */
      async validParent({ data, id, collection, cms }: Args) {
        // `seen` ends the walk on a cycle that is already stored.
        const seen = new Set<string>();
        for (
          let cur = data[parent];
          cur && !seen.has(cur);
          cur = (await cms.findById(collection!, cur, { populate: false }))?.[parent]
        ) {
          if (cur === id) throw new ValidationError({ [parent]: "Cannot be inside itself" });
          seen.add(cur);
        }
      },
      /** Sets the path from the parent's stored path and the slug, overwriting any path in the input. A root `index` is `/`. */
      async buildPath({ data, collection, cms }: Args) {
        const parentPath = data[parent]
          ? (await cms.findById(collection!, data[parent], { populate: false }))?.[path]
          : undefined;
        if (parentPath)
          return { ...data, [path]: `${parentPath === "/" ? "" : parentPath}/${data[slug]}` };
        return { ...data, [path]: data[slug] === "index" ? "/" : `/${data[slug]}` };
      },
      /** Rejects the slug if another document of the collection has the same path. MUST run after `buildPath`. */
      async uniquePath({ data, id, collection, cms }: Args) {
        const other = await cms.findOne(collection!, {
          where: { [path]: data[path] },
          populate: false,
        });
        if (other && other.id !== id)
          throw new ValidationError({ [slug]: "Already used on this level" });
      },
    },
    afterChange: {
      /**
       * When the path changes, saves each direct child again with no changes. Its own `buildPath` then updates it, down the tree.
       * In a locale, children without a row in it are skipped: saving them would add an empty translation.
       */
      async updateChildPaths({
        doc,
        previousDoc,
        collection,
        cms,
        locale,
      }: Omit<Args, "data"> & {
        locale?: string;
        doc: Record<string, any>;
        previousDoc?: Record<string, any>;
      }) {
        if (doc[path] === previousDoc?.[path]) return;
        for (const { id } of await cms.find(collection!, {
          where: { [parent]: doc.id },
          populate: false,
        })) {
          // Only localized documents have `locales`. The drafts view lists every row.
          const { locales } =
            (await cms.withDrafts().findById(collection!, id, { populate: false })) ?? {};
          if (locale && Array.isArray(locales) && !locales.includes(locale)) continue;
          await cms.update(collection!, id, {});
        }
      },
    },
  };
}
