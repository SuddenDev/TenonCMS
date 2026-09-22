import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/astro/index.ts', 'src/nuxt/index.ts'],
  dts: true,
})
