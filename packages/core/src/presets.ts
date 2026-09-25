// Presets run in browser bundles too, so this file MUST NOT import zod or server code.
import { ValidationError } from './errors.ts'
import type { Fields, LocalApi } from './schema.ts'
import { slugify } from './slugify.ts'

/** Field names the tree hooks read and write. Each defaults to the name in `page.fields`. */
export type TreeOptions = {
  /** The text field `slugFromTitle` fills an empty slug from. Default `'title'`. */
  title?: string
  /** The `slug` field. Default `'slug'`. */
  slug?: string
  /** The `relation` field that points to the parent document in the same collection. Default `'parent'`. */
  parent?: string
  /** The stored path, e.g. `/about/team`. The slug field's `path` option MUST name it too, so the admin shows it as the prefix. Default `'path'`. */
  path?: string
}

// Presets fit any collection, so data is untyped. Collection hooks always get `collection`.
type Args = { data: Record<string, any>; id?: string; collection?: string; cms: LocalApi }

/**
 * Hooks for a tree of documents with paths, as named records, so a host can leave one out by name:
 * `const { uniquePath, ...beforeChange } = page.hooks.beforeChange`. A tree without paths keeps only `noCycle`.
 * All run in the write's transaction, so two parallel saves cannot claim the same path.
 */
export function treeHooks({ title = 'title', slug = 'slug', parent = 'parent', path = 'path' }: TreeOptions = {}) {
  return {
    beforeValidate: {
      /** Fills an empty slug from the title, so API and script writes MAY omit it. */
      slugFromTitle: ({ data }: Args) => (data[slug] ? undefined : { ...data, [slug]: slugify(String(data[title] ?? '')) }),
    },
    beforeChange: {
      /** Rejects a parent that is the document itself or one of its descendants. */
      async noCycle({ data, id, collection, cms }: Args) {
        // `seen` ends the walk on a cycle that is already stored.
        const seen = new Set<string>()
        for (let cur = data[parent]; cur && !seen.has(cur); cur = (await cms.findById(collection!, cur, { populate: false }))?.[parent]) {
          if (cur === id) throw new ValidationError({ [parent]: 'Cannot be inside itself' })
          seen.add(cur)
        }
      },
      /** Sets the path from the parent's stored path and the slug, overwriting any path in the input. A root `index` is `/`. */
      async path({ data, collection, cms }: Args) {
        const parentPath = data[parent] ? (await cms.findById(collection!, data[parent], { populate: false }))?.[path] : undefined
        if (parentPath) return { ...data, [path]: `${parentPath === '/' ? '' : parentPath}/${data[slug]}` }
        return { ...data, [path]: data[slug] === 'index' ? '/' : `/${data[slug]}` }
      },
      /** Rejects the slug if another document of the collection has the same path. MUST run after `path`. */
      async uniquePath({ data, id, collection, cms }: Args) {
        const other = await cms.findOne(collection!, { where: { [path]: data[path] }, populate: false })
        if (other && other.id !== id) throw new ValidationError({ [slug]: 'Already used on this level' })
      },
    },
    afterChange: {
      /** When the path changes, saves each direct child again. Its own `path` hook then updates it, down the tree. */
      async descendantPaths({ doc, previousDoc, collection, cms }: Omit<Args, 'data'> & { doc: Record<string, any>; previousDoc?: Record<string, any> }) {
        if (doc[path] === previousDoc?.[path]) return
        for (const { id, createdAt, updatedAt, ...data } of await cms.find(collection!, { where: { [parent]: doc.id }, populate: false }))
          await cms.update(collection!, id, data)
      },
    },
  }
}

/**
 * Pages with nested URLs. Spread `page.fields` into a collection's fields and use `page.hooks` stage by stage.
 * `parent` points to `pages`; for another collection name, override it: `parent: { ...page.fields.parent, collection: 'docs' }`.
 */
export const page = {
  fields: {
    title: { type: 'text', required: true },
    slug: { type: 'slug', from: 'title', parent: 'parent', path: 'path' },
    // `restrict`: a page with children cannot be deleted, so no subtree is lost.
    parent: { type: 'relation', collection: 'pages', onDelete: 'restrict' },
    path: { type: 'text', readOnly: true },
  },
  hooks: treeHooks(),
} as const satisfies { fields: Fields; hooks: object }
