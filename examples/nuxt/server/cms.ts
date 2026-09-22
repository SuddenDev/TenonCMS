import { createCms, defineConfig } from 'integral-cms'

const config = defineConfig({
  collections: {
    posts: {
      label: 'Posts',
      titleField: 'title',
      fields: {
        title: { type: 'text', required: true },
        slug: { type: 'text', required: true },
        publishedAt: { type: 'date', label: 'Published at' },
        category: { type: 'select', options: ['news', 'guide'] },
        featured: { type: 'boolean' },
        body: { type: 'textarea' },
      },
    },
  },
  globals: {
    site: {
      label: 'Site settings',
      fields: {
        title: { type: 'text', required: true },
        tagline: { type: 'text' },
      },
    },
  },
})

const { cmsSecret, databaseUrl } = useRuntimeConfig()

export const cms = createCms({
  config,
  database: { url: databaseUrl },
  secret: cmsSecret,
})
