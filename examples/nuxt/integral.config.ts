import { createCms } from 'integral-cms'
import { posts } from './collections/posts'

const { cmsSecret, databaseUrl } = useRuntimeConfig()

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
  database: { url: databaseUrl },
  secret: cmsSecret,
})
