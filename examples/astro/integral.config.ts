import { CMS_SECRET, DATABASE_URL } from 'astro:env/server'
import { defineCms } from 'integral-cms'
import { authors } from './collections/authors'
import { posts } from './collections/posts'

export default defineCms({
  collections: { posts, authors },
  globals: {
    site: {
      label: 'Site settings',
      fields: {
        title: { type: 'text', required: true },
        tagline: { type: 'text' },
      },
    },
  },
  database: { url: DATABASE_URL },
  secret: CMS_SECRET,
})
