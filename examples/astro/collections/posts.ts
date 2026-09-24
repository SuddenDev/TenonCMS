import { defineCollection } from 'integral-cms'

export const posts = defineCollection({
  label: 'Posts',
  titleField: 'title',
  fields: {
    title: { type: 'text', required: true },
    slug: { type: 'text', required: true },
    author: { type: 'relation', collection: 'authors', label: 'Author' },
    publishedAt: { type: 'date', label: 'Published at' },
    category: { type: 'select', options: ['news', 'guide'] },
    featured: { type: 'boolean' },
    color: { type: 'custom:color', label: 'Accent color' },
    body: { type: 'textarea' },
  },
})
