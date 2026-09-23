import type { AstroIntegration } from 'astro'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { adminPath, type AdminOption } from '../admin/html.ts'

export type Options = {
  /** File that exports the `cms` instance, relative to the project root. Defaults to `./integral.config.ts`. */
  entry?: string
  /** Path of the admin, e.g. `/cms`. Defaults to `/admin`. `false` leaves only the API (headless). `true` is default behavior */
  admin?: AdminOption
}

export default function integralCms({ entry = './integral.config.ts', admin = true }: Options = {}): AstroIntegration {
  let entryPath: string
  return {
    name: 'integral-cms',
    hooks: {
      'astro:config:setup'({ command, config, injectRoute, addMiddleware, updateConfig }) {
        entryPath = fileURLToPath(new URL(entry, config.root))
        const alias: Record<string, string> = { '#integral/config': entryPath }
        injectRoute({ pattern: '/api/cms/[...path]', entrypoint: new URL('./route.ts', import.meta.url), prerender: false })
        const path = adminPath(admin)
        if (path) {
          injectRoute({ pattern: `${path}/[...path]`, entrypoint: new URL('./admin.astro', import.meta.url), prerender: false })
          // Optional host file with admin customization, e.g. custom field inputs.
          const adminFile = fileURLToPath(new URL('./integral.admin.ts', config.root))
          alias['#integral/admin'] = existsSync(adminFile) ? adminFile : fileURLToPath(new URL('../admin/default.ts', import.meta.url))
        }
        addMiddleware({ entrypoint: new URL('./middleware.ts', import.meta.url), order: 'pre' })
        updateConfig({
          vite: {
            resolve: { alias },
            // Linked workspace packages get bundled by default, which breaks libsql's native binding.
            // Dev does not bundle. Keeping core internal there lets Vite reload it when `dist/` changes.
            ssr: command === 'dev' ? {} : { external: ['integral-cms'] },
          },
        })
      },
      'astro:config:done'({ injectTypes }) {
        // Astro's type injection takes a string. This is the only generated code.
        // `export {}` makes it a module, so `declare module` augments the client instead of replacing it.
        const module = JSON.stringify(entryPath.replace(/\.[cm]?[jt]s$/, ''))
        injectTypes({
          filename: 'types.d.ts',
          content: `declare global {
  namespace App {
    interface Locals {
      integral: typeof import(${module}).cms
    }
  }
}
declare module 'integral-cms/client' {
  interface Register {
    cms: typeof import(${module}).cms
  }
}
export {}
`,
        })
      },
    },
  }
}
