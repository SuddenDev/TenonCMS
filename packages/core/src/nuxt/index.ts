import { addServerHandler, addTemplate, defineNuxtModule } from '@nuxt/kit'
import type {} from '@nuxt/nitro-server/augments'
import type { NuxtModule } from '@nuxt/schema'
import { createRequire, findPackageJSON } from 'node:module'
import { resolve } from 'node:path'

export type Options = {
  // File that exports the `cms` instance, relative to the project root.
  entry?: string
}

const integralCms: NuxtModule<Options> = defineNuxtModule<Options>({
  meta: { name: 'integral-cms', configKey: 'integralCms' },
  defaults: { entry: './server/cms.ts' },
  setup(options, nuxt) {
    const entryPath = resolve(nuxt.options.rootDir, options.entry!)
    const handler = addTemplate({
      filename: 'integral-cms/handler.ts',
      write: true,
      getContents: () =>
        [
          `import { defineEventHandler, toWebRequest } from 'h3'`,
          `import { cms } from ${JSON.stringify(entryPath)}`,
          `export default defineEventHandler((event) => cms.fetch(toWebRequest(event)))`,
        ].join('\n'),
    })
    for (const route of ['/admin', '/admin/**', '/api/cms/**']) {
      addServerHandler({ route, handler: handler.dst })
    }
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
