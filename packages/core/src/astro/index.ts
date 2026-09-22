import type { AstroIntegration } from 'astro'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export type Options = {
  // File that exports the `cms` instance, relative to the project root.
  entry?: string
}

export default function integralCms({ entry = './src/cms.ts' }: Options = {}): AstroIntegration {
  return {
    name: 'integral-cms',
    hooks: {
      'astro:config:setup'({ config, createCodegenDir, injectRoute, updateConfig }) {
        const entryPath = fileURLToPath(new URL(entry, config.root))
        const route = new URL('route.ts', createCodegenDir())
        writeFileSync(
          route,
          [
            `import type { APIRoute } from 'astro'`,
            `import { cms } from ${JSON.stringify(entryPath)}`,
            `export const prerender = false`,
            `export const ALL: APIRoute = ({ request }) => cms.fetch(request)`,
          ].join('\n'),
        )
        for (const pattern of ['/admin/[...path]', '/api/cms/[...path]']) {
          injectRoute({ pattern, entrypoint: route, prerender: false })
        }
        // Linked workspace packages get bundled by default, which breaks libsql's native binding.
        updateConfig({ vite: { ssr: { external: ['integral-cms'] } } })
      },
    },
  }
}
