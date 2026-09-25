import { expect, it } from 'vitest'
import { SLUG_PATTERN, slugify } from './slugify.ts'

it.each([
  ['Über uns', 'uber-uns'],
  ['  Hello,   World!  ', 'hello-world'],
  ['--Straße 5--', 'strasse-5'],
  ['C’est la vie', 'c-est-la-vie'],
  ['Crème brûlée', 'creme-brulee'],
  ['', ''],
])('slugify: %s', (text, expected) => expect(slugify(text)).toBe(expected))

it('produces values that match the pattern', () => {
  expect(new RegExp(`^(?:${SLUG_PATTERN})$`, 'v').test(slugify('Über uns!'))).toBe(true)
})
