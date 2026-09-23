import type { AstroIntegration } from 'astro'
import { fileURLToPath } from 'node:url'

export type Options = {
  // File that exports the `cms` instance, relative to the project root.
  entry?: string
}

export default function integralCms({ entry = './integral.config.ts' }: Options = {}): AstroIntegration {
  let entryPath: string
  return {
    name: 'integral-cms',
    hooks: {
      'astro:config:setup'({ config, injectRoute, addMiddleware, updateConfig }) {
        entryPath = fileURLToPath(new URL(entry, config.root))
        for (const pattern of ['/admin/[...path]', '/api/cms/[...path]']) {
          injectRoute({ pattern, entrypoint: new URL('./route.ts', import.meta.url), prerender: false })
        }
        addMiddleware({ entrypoint: new URL('./middleware.ts', import.meta.url), order: 'pre' })
        updateConfig({
          vite: {
            resolve: { alias: { '#integral/config': entryPath } },
            // Linked workspace packages get bundled by default, which breaks libsql's native binding.
            ssr: { external: ['integral-cms'] },
          },
        })
      },
      'astro:config:done'({ injectTypes }) {
        // Astro's type injection takes a string. This is the only generated code.
        const module = JSON.stringify(entryPath.replace(/\.[cm]?[jt]s$/, ''))
        injectTypes({
          filename: 'types.d.ts',
          content: `declare namespace App {\n  interface Locals {\n    integral: typeof import(${module}).cms\n  }\n}\n`,
        })

      },
    },
  }
}
