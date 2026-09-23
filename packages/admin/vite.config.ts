import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

// The example dev server serves the API. `pnpm dev:<example>` sets CMS_URL.
const target = process.env.CMS_URL ?? 'http://localhost:4321'

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  build: {
    // Vue is bundled in. Hosts plug in through `mount(el)`, so no shared runtime is needed.
    lib: { entry: 'src/index.ts', formats: ['es'], fileName: 'index' },
    outDir: '../core/dist/admin',
    emptyOutDir: false,
  },
  server: {
    port: 5173,
    strictPort: true,
    // better-auth rejects requests whose origin differs from the API host.
    proxy: { '/api/cms': { target, changeOrigin: true, headers: { origin: target } } },
  },
})
