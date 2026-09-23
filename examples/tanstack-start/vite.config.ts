import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { nitro } from 'nitro/vite'
import { defineConfig } from 'vite'

export default defineConfig(({ command }) => ({
  plugins: [tanstackStart(), nitro(), viteReact()],
  // Linked workspace packages get bundled by default, which breaks libsql's native binding.
  // Dev does not bundle. Keeping core internal there lets Vite reload it when `dist/` changes.
  ssr: command === 'build' ? { external: ['integral-cms'] } : {},
}))
