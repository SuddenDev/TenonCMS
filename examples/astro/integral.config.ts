import { CMS_SECRET, DATABASE_URL } from 'astro:env/server'
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
  database: { url: DATABASE_URL },
  secret: CMS_SECRET,
})
