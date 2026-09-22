import node from '@astrojs/node'
import { defineConfig, envField } from 'astro/config'
import integralCms from 'integral-cms/astro'

export default defineConfig({
  adapter: node({ mode: 'standalone' }),
  integrations: [integralCms()],
  env: {
    schema: {
      CMS_SECRET: envField.string({ context: 'server', access: 'secret', min: 32 }),
      DATABASE_URL: envField.string({ context: 'server', access: 'secret', default: 'file:./cms.db' }),
    },
  },
})
