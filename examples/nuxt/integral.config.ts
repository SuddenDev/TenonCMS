import { defineCms } from 'integral-cms'
import { posts } from './collections/posts'

const { cmsSecret, databaseUrl } = useRuntimeConfig()

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
  database: { url: databaseUrl },
  secret: cmsSecret,
})
