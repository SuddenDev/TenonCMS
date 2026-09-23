import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/astro/index.ts', 'src/nuxt/index.ts'],
  dts: true,
  // Runtime files ship as source. The host's Vite and Nitro compile them and resolve `#integral/config`.
  copy: [
    { from: 'src/astro/route.ts', to: 'dist/astro' },
    { from: 'src/astro/middleware.ts', to: 'dist/astro' },
    { from: 'src/nuxt/runtime', to: 'dist/nuxt' },
  ],
})
