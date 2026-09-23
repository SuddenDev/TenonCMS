import { createCms } from 'integral-cms'
import { posts } from './collections/posts'

export const cms = createCms({
  config: {
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
  },
  database: { url: process.env.DATABASE_URL ?? 'file:./cms.db' },
  secret: process.env.CMS_SECRET!,
})
