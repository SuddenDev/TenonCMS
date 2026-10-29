import { resolve } from "node:path";
import type { Plugin } from "vite";
import { checkSiteStyles } from "./check-site-styles.ts";
import { collectClientRefs } from "./collect-client-refs.ts";
import type { ClientRef, Resolver } from "./types.ts";

const REGISTRY = "#tenon/client-registry";
const VIRTUAL = "\0tenon-client-registry";

/**
 * Vite plugin that serves `#tenon/client-registry` to every framework adapter. The module maps each
 * `clientRef()` specifier of the configuration to a lazy import of its export.
 * @param entry Server configuration, relative to the project root.
 * @param projectRoot Project root. Defaults to Vite's root.
 */
export function clientReferences(entry = "./tenon.config.ts", projectRoot?: string): Plugin {
  let root = "";
  let config = "";
  return {
    name: "tenoncms:client-references",
    configResolved(options) {
      root = projectRoot ?? options.root;
      config = resolve(root, entry);
    },
    resolveId: (id) => (id === REGISTRY ? VIRTUAL : undefined),
    async load(id) {
      if (id !== VIRTUAL) return;
      const resolver: Resolver = async (source, importer) =>
        (await this.resolve(source, importer, { skipSelf: true }))?.id ?? null;

      const refs = await collectClientRefs(root, [config], resolver, (file) =>
        this.addWatchFile(file),
      );
      const siteFiles = Object.values(refs)
        .filter((ref) => ref.site)
        .map((ref) => ref.file);
      await checkSiteStyles(siteFiles, resolver);

      for (const { file } of Object.values(refs)) this.addWatchFile(file);
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
