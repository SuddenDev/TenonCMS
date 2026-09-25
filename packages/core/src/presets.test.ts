import { expect, it } from 'vitest'
import { page, seoMeta } from './presets.ts'

const fill = (data: object) => page.hooks.beforeValidate.slugFromTitle({ data } as any)

it('slugFromTitle fills an empty slug', () => {
  expect(fill({ title: 'Über uns' })?.slug).toBe('uber-uns')
  expect(fill({ title: 'Über uns', slug: '' })?.slug).toBe('uber-uns')
})

it('slugFromTitle keeps a given slug', () => {
  expect(fill({ title: 'A', slug: 'b' })).toBeUndefined()
})

const path = async (slug: string, parentPath?: string) =>
  (
    await page.hooks.beforeChange.path({
      data: { slug, parent: parentPath === undefined ? null : 'p' },
      collection: 'pages',
      cms: { findById: async () => ({ path: parentPath }) },
    } as any)
  )?.path

it('path: index at root is /', async () => expect(await path('index')).toBe('/'))
it('path: root page', async () => expect(await path('about')).toBe('/about'))
it('path: child of / has one slash', async () => expect(await path('child', '/')).toBe('/child'))
it('path: nested child', async () => expect(await path('berlin', '/about/team')).toBe('/about/team/berlin'))

it('seoMeta falls back to the title', () => {
  expect(seoMeta({ title: 'About', seo: null })).toEqual({ title: 'About', description: undefined, noindex: false })
  expect(seoMeta({ title: 'About' })).toEqual({ title: 'About', description: undefined, noindex: false })
  expect(seoMeta({ title: 'About', seo: { title: '', description: 'D', noindex: true } })).toEqual({ title: 'About', description: 'D', noindex: true })
  expect(seoMeta({ title: 'About', seo: { title: 'Custom' } }).title).toBe('Custom')
})
