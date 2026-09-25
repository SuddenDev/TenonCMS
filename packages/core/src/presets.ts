// Presets run in browser bundles too, so this file MUST NOT import zod or server code.
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
      /** Sets `path` from the parent's stored path and the slug. It overwrites any `path` in the input. A root `index` is `/`. */
      async path({ data, collection, cms }: any) {
        const parentPath = data.parent ? (await cms.findById(collection, data.parent, { populate: false }))?.path : undefined
        if (parentPath) return { ...data, path: `${parentPath === '/' ? '' : parentPath}/${data.slug}` }
        return { ...data, path: data.slug === 'index' ? '/' : `/${data.slug}` }
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
