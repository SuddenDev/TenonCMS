import { resolve } from 'node:path'

export default defineNuxtConfig({
  compatibilityDate: '2026-09-01',
  modules: ['integral-cms/nuxt'],
  // Set with NUXT_CMS_SECRET and NUXT_DATABASE_URL.
  runtimeConfig: {
    cmsSecret: '',
    // Absolute, because `nuxt preview` runs the server from inside .output/.
    databaseUrl: `file:${resolve('cms.db')}`,
  },
})
