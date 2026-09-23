import { describe, expect, it } from 'vitest'
import { dataSchema } from './schema.ts'

describe('dataSchema', () => {
  const schema = dataSchema({
    title: { type: 'text', required: true },
    body: { type: 'textarea' },
    views: { type: 'number' },
    featured: { type: 'boolean' },
    publishedAt: { type: 'date' },
    status: { type: 'select', options: ['draft', 'published'] },
  })

  it('accepts valid data and strips unknown keys', () => {
    expect(schema.parse({ title: 'Hi', views: 3, featured: true, publishedAt: '2026-09-23', status: 'draft', extra: 1 })).toEqual({
      title: 'Hi',
      views: 3,
      featured: true,
      publishedAt: '2026-09-23',
      status: 'draft',
    })
  })

  it('allows optional fields to be missing or null', () => {
    expect(schema.safeParse({ title: 'Hi', body: null, views: null }).success).toBe(true)
  })

  it('rejects a missing or empty required text', () => {
    expect(schema.safeParse({}).success).toBe(false)
    expect(schema.safeParse({ title: '' }).success).toBe(false)
  })

  it('rejects values of the wrong type', () => {
    expect(schema.safeParse({ title: 'Hi', views: '3' }).success).toBe(false)
    expect(schema.safeParse({ title: 'Hi', featured: 'true' }).success).toBe(false)
    expect(schema.safeParse({ title: 'Hi', publishedAt: '23.09.2026' }).success).toBe(false)
    expect(schema.safeParse({ title: 'Hi', status: 'archived' }).success).toBe(false)
  })
})
