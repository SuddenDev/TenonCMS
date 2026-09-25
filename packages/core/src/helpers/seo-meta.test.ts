import { expect, it } from 'vitest'
import { seoMeta } from './seo-meta.ts'

it('seoMeta falls back to the title', () => {
  expect(seoMeta({ title: 'About', seo: null })).toEqual({ title: 'About', description: undefined, noindex: false })
  expect(seoMeta({ title: 'About' })).toEqual({ title: 'About', description: undefined, noindex: false })
  expect(seoMeta({ title: 'About', seo: { title: '', description: 'D', noindex: true } })).toEqual({ title: 'About', description: 'D', noindex: true })
  expect(seoMeta({ title: 'About', seo: { title: 'Custom' } }).title).toBe('Custom')
})

it('helpers come from the main and the browser-safe client entry', async () => {
  for (const entry of [await import('../index.ts'), await import('../client.ts')]) {
    expect(entry).toMatchObject({ seoMeta, slugify: expect.any(Function), SLUG_PATTERN: expect.any(String) })
  }
})
