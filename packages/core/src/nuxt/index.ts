import { addImports, addServerHandler, addTypeTemplate, addVitePlugin, createResolver, defineNuxtModule } from '@nuxt/kit'
import type {} from '@nuxt/nitro-server/augments'
import type { NuxtModule } from '@nuxt/schema'
import { adminHtml, adminPath, type AdminOption } from '../admin/html.ts'
import { existsSync } from 'node:fs'
import { createRequire, findPackageJSON } from 'node:module'
import { resolve } from 'node:path'

export type Options = {
  /** File that exports the `cms` instance, relative to the project root. Defaults to `./integral.config.ts`. */
  entry?: string
  /** Path of the admin, e.g. `/cms`. Defaults to `/admin`. `false` leaves only the API (headless). `true` is default behavior */
  admin?: AdminOption
}

const integralCms: NuxtModule<Options> = defineNuxtModule<Options>({
  meta: { name: 'integral-cms', configKey: 'integralCms' },
  defaults: { entry: './integral.config.ts', admin: true },
  setup(options, nuxt) {
    const runtime = createResolver(import.meta.url).resolve('./runtime')
    // Nuxt forwards aliases to Nitro and to the generated tsconfig paths.
    nuxt.options.alias['#integral/config'] = resolve(nuxt.options.rootDir, options.entry!)
    nuxt.options.build.transpile.push(runtime)
    addServerHandler({ route: '/api/cms/**', handler: `${runtime}/server/handler` })
    const path = adminPath(options.admin)
    if (path) {
      // Optional host file with admin customization, e.g. custom field inputs.
      const adminFile = resolve(nuxt.options.rootDir, 'integral.admin.ts')
      nuxt.options.alias['#integral/admin'] = existsSync(adminFile) ? adminFile : resolve(runtime, '../../admin/default.ts')
      // The admin is a second browser entry in the host's Vite build, served on a page of its own.
      const entry = resolve(runtime, '../../admin/entry.ts')
      const assets = nuxt.options.app.baseURL.replace(/\/$/, '') + nuxt.options.app.buildAssetsDir
      let html = adminHtml(`<script type="module" src="${assets}@vite/client"></script><script type="module" src="${assets}@fs${entry}"></script>`, path)
      addVitePlugin(
        {
          name: 'integral-cms:admin',
          configEnvironment: (name) => (name === 'client' ? { build: { rolldownOptions: { input: { 'integral-admin': entry } } } } : undefined),
        },
        { server: false },
      )
      nuxt.hook('build:manifest', (manifest) => {
        if (nuxt.options.dev) return
        const [key, chunk] = Object.entries(manifest).find(([, c]) => c.isEntry && c.name === 'integral-admin')!
        // Nuxt preloads every manifest entry on every page. The admin MUST stay off the host's pages.
        delete manifest[key]
        html = adminHtml([...(chunk.css ?? []).map((css) => `<link rel="stylesheet" href="${assets}${css}">`), `<script type="module" src="${assets}${chunk.file}"></script>`].join(''), path)
      })
      nuxt.hook('nitro:config', (config) => {
        config.virtual ??= {}
        // A function, because Nitro builds after the client manifest exists.
        config.virtual['#integral/admin-html'] = () => `export default ${JSON.stringify(html)}`
      })
      // `/admin/**` does not match `/admin` itself.
      for (const route of [path, `${path}/**`]) addServerHandler({ route, handler: `${runtime}/server/admin` })
    }
    addImports({ name: 'useIntegral', from: `${runtime}/composables` })
    // Types `createClient()` from `integral-cms/client` without a type argument.
    addTypeTemplate(
      {
        filename: 'types/integral-cms.d.ts',
        getContents: () => `/// <reference types="integral-cms/register" />\nexport {}\n`,
      },
      { nuxt: true, nitro: true },
    )
    nuxt.hook('nitro:config', (config) => {
      config.externals ??= {}
      config.externals.traceInclude = [...(config.externals.traceInclude ?? []), ...libsqlBinaries()]
    })
  },
})

// libsql loads its native binary with a dynamic require, which Nitro's file tracer cannot follow.
function libsqlBinaries() {
  const client = createRequire(import.meta.url).resolve('@libsql/client')
  const pkg = findPackageJSON('libsql', client)!
  const require = createRequire(pkg)
  return Object.keys(require(pkg).optionalDependencies).flatMap((name) => {
    try {
      return [require.resolve(name)]
    } catch {
      // Binaries for other platforms are not installed.
      return []
    }
  })
}

export default integralCms
