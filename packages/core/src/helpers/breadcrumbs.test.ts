import { expect, it } from 'vitest'
import { breadcrumbs } from './breadcrumbs.ts'

const about = { id: 'a', title: 'About', path: '/about', parent: null }
const team = { id: 't', title: 'Team', path: '/about/team', parent: about }
const person = { id: 'p', title: 'Person', path: '/about/team/person', parent: team }

it('walks the parent chain from the root down', () => {
  expect(breadcrumbs(person)).toEqual([
    { title: 'About', path: '/about' },
    { title: 'Team', path: '/about/team' },
    { title: 'Person', path: '/about/team/person' },
  ])
})

it('is one entry for a root page', () => {
  expect(breadcrumbs(about)).toEqual([{ title: 'About', path: '/about' }])
  expect(breadcrumbs({ id: 'r', title: 'Root', path: '/' })).toEqual([{ title: 'Root', path: '/' }])
})

it('starts at the last resolved ancestor', () => {
  expect(breadcrumbs({ ...person, parent: { ...team, parent: 'a' } })).toEqual([
    { title: 'Team', path: '/about/team' },
    { title: 'Person', path: '/about/team/person' },
  ])
})

it('reads other field names and falls back to empty strings', () => {
  const doc = { name: 'Leaf', url: '/x/leaf', up: { name: 'X', url: '/x' } }
  expect(breadcrumbs(doc, { title: 'name', path: 'url', parent: 'up' })).toEqual([
    { title: 'X', path: '/x' },
    { title: 'Leaf', path: '/x/leaf' },
  ])
  expect(breadcrumbs({ title: null })).toEqual([{ title: '', path: '' }])
})
