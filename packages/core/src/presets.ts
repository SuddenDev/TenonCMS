// Presets run in browser bundles too, so this file MUST NOT import zod or server code.
import { ValidationError } from './errors.ts'
import type { Fields } from './schema.ts'
import { slugify } from './slugify.ts'

/**
 * Hooks for a page tree, as named records, so a host can leave one out by name.
 * Presets fit any collection, so their arguments are untyped.
 */
export function treeHooks() {
  return {
    beforeValidate: {
      /** Fills an empty slug from the title, so API and script writes MAY omit it. */
      slugFromTitle: ({ data }: any) => (data.slug ? undefined : { ...data, slug: slugify(String(data.title ?? '')) }),
    },
    beforeChange: {
      /** Rejects a parent that is the document itself or one of its descendants. */
      async noCycle({ data, id, collection, cms }: any) {
        // `seen` ends the walk on a cycle that is already stored.
        const seen = new Set<string>()
        for (let cur = data.parent; cur && !seen.has(cur); cur = (await cms.findById(collection, cur, { populate: false }))?.parent) {
          if (cur === id) throw new ValidationError({ parent: 'A page cannot be inside itself' })
          seen.add(cur)
        }
      },
      /** Sets `path` from the parent's stored path and the slug. It overwrites any `path` in the input. A root `index` is `/`. */
      async path({ data, collection, cms }: any) {
        const parentPath = data.parent ? (await cms.findById(collection, data.parent, { populate: false }))?.path : undefined
        if (parentPath) return { ...data, path: `${parentPath === '/' ? '' : parentPath}/${data.slug}` }
        return { ...data, path: data.slug === 'index' ? '/' : `/${data.slug}` }
      },
      /** Rejects the slug if another document of the collection has the same path. MUST run after `path`. */
      async uniquePath({ data, id, collection, cms }: any) {
        const other = await cms.findOne(collection, { where: { path: data.path }, populate: false })
        if (other && other.id !== id) throw new ValidationError({ slug: 'Already used on this level' })
      },
    },
    afterChange: {
      /** When `path` changes, saves each direct child again. Its own `path` hook then updates it, down the tree, in the same transaction. */
      async descendantPaths({ doc, previousDoc, collection, cms }: any) {
        if (doc.path === previousDoc?.path) return
        for (const { id, createdAt, updatedAt, ...data } of await cms.find(collection, { where: { parent: doc.id }, populate: false }))
          await cms.update(collection, id, data)
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
