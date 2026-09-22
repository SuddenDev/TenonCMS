import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { nitro } from 'nitro/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [tanstackStart(), nitro(), viteReact()],
  // Linked workspace packages get bundled by default, which breaks libsql's native binding.
  ssr: { external: ['integral-cms'] },
})
