import { defineCms } from 'integral-cms'
import { posts } from './collections/posts'

export default defineCms({
  collections: { posts },
  globals: {
    site: {
      label: 'Site settings',
      fields: {
        title: { type: 'text', required: true },
        tagline: { type: 'text' },
      },
    },
  },
  database: { url: process.env.DATABASE_URL ?? 'file:./cms.db' },
  secret: process.env.CMS_SECRET!,
})
