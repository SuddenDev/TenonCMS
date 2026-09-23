import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin, ViteDevServer } from 'vite'
import { adminHtml, adminPath } from '../admin/html.ts'

const adminDir = fileURLToPath(new URL('../admin/', import.meta.url))
const entry = `${adminDir}entry.ts`
const virtualId = '\0integral-admin-html'

/**
 * Builds the admin as a second client entry and exposes its page as `#integral/admin-html`.
 * For Vite frameworks without an adapter. Serve the page from a server route for `/admin` and `/admin/*`.
 * With `path`, the server route MUST match it, e.g. `src/routes/cms.$.ts` for `/cms`.
 * @example
 * // vite.config.ts
 * plugins: [tanstackStart(), integralAdmin()]
 *
 * // src/routes/admin.$.ts
 * import html from '#integral/admin-html'
 * GET: () => new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } })
 */
export function integralAdmin({ path: option = '/admin' }: { path?: `/${string}` } = {}): Plugin {
  const path = adminPath(option)!
  let server: ViteDevServer | undefined
  let html = ''
  return {
    name: 'integral-cms:admin',
    config(config) {
      // Optional host file with admin customization, e.g. custom field inputs.
      const file = resolve(config.root ?? process.cwd(), 'integral.admin.ts')
      return { resolve: { alias: { '#integral/admin': existsSync(file) ? file : `${adminDir}default.ts` } } }
    },
    configEnvironment: (name) => (name === 'client' ? { build: { rolldownOptions: { input: { 'integral-admin': entry } } } } : undefined),
    configureServer(s) {
      server = s
    },
    generateBundle(_, bundle) {
      if (this.environment.name !== 'client') return
      const base = this.environment.config.base
      const chunk = Object.values(bundle).find((c) => c.type === 'chunk' && c.isEntry && c.name === 'integral-admin')
      if (chunk?.type !== 'chunk') return
      // Frameworks may expect a single client entry, e.g. TanStack Start throws on a second one.
      chunk.isEntry = false
      const css = [...(chunk.viteMetadata?.importedCss ?? [])].map((file) => `<link rel="stylesheet" href="${base}${file}">`)
      html = adminHtml([...css, `<script type="module" src="${base}${chunk.fileName}"></script>`].join(''), path)
    },
    resolveId: (id) => (id === '#integral/admin-html' ? virtualId : undefined),
    async load(id) {
      if (id !== virtualId) return
      // Dev: Vite's HTML transforms add its client and framework preambles, e.g. React Refresh.
      if (this.environment.config.command === 'serve' && server) html = await server.transformIndexHtml(path, adminHtml(`<script type="module" src="/@fs${entry}"></script>`, path))
      return `export default ${JSON.stringify(html)}`
    },
  }
}
