import { addImports, addServerHandler, createResolver, defineNuxtModule, extendPages } from '@nuxt/kit'
import type {} from '@nuxt/nitro-server/augments'
import type { NuxtModule } from '@nuxt/schema'
import { existsSync } from 'node:fs'
import { createRequire, findPackageJSON } from 'node:module'
import { resolve } from 'node:path'

export type Options = {
  // File that exports the `cms` instance, relative to the project root.
  entry?: string
  // Serve the admin at /admin. `false` leaves only the API (headless).
  admin?: boolean
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
    if (options.admin) {
      // Optional host file with admin customization, e.g. custom field inputs.
      const adminFile = resolve(nuxt.options.rootDir, 'integral.admin.ts')
      nuxt.options.alias['#integral/admin'] = existsSync(adminFile) ? adminFile : resolve(runtime, '../../admin/default.ts')
      // One key for every sub-path, or Nuxt remounts the page on back/forward.
      extendPages((pages) => {
        pages.push({ name: 'integral-admin', path: '/admin/:path(.*)*', file: `${runtime}/admin.vue`, meta: { key: 'admin' } })
      })
    }
    addImports({ name: 'useIntegral', from: `${runtime}/composables` })
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
