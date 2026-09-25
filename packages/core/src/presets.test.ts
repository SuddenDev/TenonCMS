import { expect, it } from 'vitest'
import { page } from './presets.ts'

const fill = (data: object) => page.hooks.beforeValidate.slugFromTitle({ data } as any)

it('slugFromTitle fills an empty slug', () => {
  expect(fill({ title: 'Über uns' })?.slug).toBe('uber-uns')
  expect(fill({ title: 'Über uns', slug: '' })?.slug).toBe('uber-uns')
})

it('slugFromTitle keeps a given slug', () => {
  expect(fill({ title: 'A', slug: 'b' })).toBeUndefined()
})
