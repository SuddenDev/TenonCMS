import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/client.ts', 'src/astro/index.ts', 'src/nuxt/index.ts', 'src/admin/vue.ts', 'src/admin/react.ts', 'src/vite/index.ts'],
  dts: true,
  // Runtime files ship as source. The host's Vite and Nitro compile them and resolve `#integral/config`.
  copy: [
    { from: 'src/astro/route.ts', to: 'dist/astro' },
    { from: 'src/astro/middleware.ts', to: 'dist/astro' },
    { from: 'src/astro/admin.astro', to: 'dist/astro' },
    { from: 'src/nuxt/runtime', to: 'dist/nuxt' },
    { from: 'src/register.d.ts', to: 'dist' },
    // The admin's Vite build writes index.js next to these.
    { from: 'src/admin/index.d.ts', to: 'dist/admin' },
    { from: 'src/admin/default.ts', to: 'dist/admin' },
    { from: 'src/admin/entry.ts', to: 'dist/admin' },
    { from: 'src/admin/virtual.d.ts', to: 'dist/admin' },
  ],
})
