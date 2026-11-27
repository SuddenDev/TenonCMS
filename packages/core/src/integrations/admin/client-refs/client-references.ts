import { resolve } from "node:path";
import type { Plugin, ViteDevServer } from "vite";
import { checkSiteStyles } from "./check-site-styles.ts";
import { collectClientRefs } from "./collect-client-refs.ts";
import type { ClientRef, Resolver } from "./types.ts";

const REGISTRY = "#tenon/client-registry";
export const REGISTRY_ID = "\0tenon-client-registry";

/**
 * Vite plugin that serves `#tenon/client-registry` to every framework adapter. The module maps each
 * `clientRef()` specifier of the configuration to a lazy import of its export.
 * @param entry Server configuration, relative to the project root.
 * @param projectRoot Project root. Defaults to Vite's root.
 */
export function clientReferences(entry = "./tenon.config.ts", projectRoot?: string): Plugin {
  let root = "";
  let config = "";
  let server: ViteDevServer | undefined;
  const watched = new Set<string>();
  return {
    name: "tenoncms:client-references",
    // Vite's resolver reads the `imports` of tenoncms, which map the registry to an empty one for sites without
    // this plugin. This plugin MUST resolve the specifier before that.
    enforce: "pre",
    // The dependency optimizer runs none of the host's plugins. It MUST leave the specifier to this plugin, or a
    // pre-bundled `tenoncms/preview` holds the empty registry in dev.
    config: () => ({
      optimizeDeps: {
        rolldownOptions: {
          plugins: [
            {
              name: "tenoncms:client-registry-external",
              resolveId: (id) => (id === REGISTRY ? { id, external: true } : undefined),
            },
          ],
        },
      },
    }),
    configureServer(devServer) {
      server = devServer;
    },
    hotUpdate({ file, modules }) {
      if (!watched.has(file)) return;
      const registry = this.environment.moduleGraph.getModuleById(REGISTRY_ID);
      if (!registry) return;
      this.environment.moduleGraph.invalidateModule(registry);
      return [...modules, registry];
    },
    configResolved(options) {
      root = projectRoot ?? options.root;
      config = resolve(root, entry);
    },
    resolveId: (id) => (id === REGISTRY ? REGISTRY_ID : undefined),
    async load(id) {
      if (id !== REGISTRY_ID) return;
      const resolver: Resolver = async (source, importer) =>
        (await this.resolve(source, importer, { skipSelf: true }))?.id ?? null;

      // Vite treats addWatchFile() as an import. Browser warmup MUST NOT follow server config files.
      const watch = (file: string) => {
        if (!server) return this.addWatchFile(file);
        watched.add(file);
        server.watcher.add(file);
      };
      const refs = await collectClientRefs(root, [config], resolver, watch);
      const siteFiles = Object.values(refs)
        .filter((ref) => ref.site)
        .map((ref) => ref.file);
      await checkSiteStyles(siteFiles, resolver);

      for (const { file } of Object.values(refs)) watch(file);
      return registryModule(refs);
    },
  };
}

function registryModule(refs: Record<string, ClientRef>) {
  const loaders = Object.entries(refs).map(([key, ref]) => loader(key, ref));
  return `export default {${loaders.join(",")}}`;
}

// Throws on load when the file does not export the name, so a typo in `clientRef()` shows up in the console.
function loader(key: string, ref: ClientRef) {
  const missing = `tenoncms: missing export "${ref.export}" in clientRef("${key}")`;
  return `${JSON.stringify(key)}: () => import(${JSON.stringify(ref.file)}).then(m => { const value = m[${JSON.stringify(ref.export)}]; if (value === undefined) throw new Error(${JSON.stringify(missing)}); return value; })`;
}
