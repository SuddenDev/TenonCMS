import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

// The example dev server serves the API. `pnpm dev:<example>` sets CMS_URL.
const target = process.env.CMS_URL ?? 'http://localhost:4321'

export default defineConfig({
  base: '/admin/',
  plugins: [vue(), tailwindcss()],
  server: {
    // The dev scripts redirect `/admin` on the example to this port.
    port: 5173,
    strictPort: true,
    // better-auth rejects requests whose origin differs from the API host.
    proxy: { '/api/cms': { target, changeOrigin: true, headers: { origin: target } } },
  },
})
