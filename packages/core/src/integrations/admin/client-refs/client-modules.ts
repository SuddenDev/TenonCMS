import { isBuiltin } from "node:module";
import { resolve } from "node:path";
import type { Plugin } from "vite";
import { clientModuleExports, clientModuleId, isClientModule } from "./client-module.ts";
import { REGISTRY_ID } from "./client-references.ts";

export type ClientModulesOptions = {
  root?: string;
  /** Set for server builds outside Vite, such as Nitro or a plugin's server package. */
  server?: boolean;
  /** Maps browser source files to public package exports when publishing a plugin. */
  references?: Record<string, string>;
};

/** Keeps browser implementations out of server builds and rejects server dependencies in browser builds. */
export function clientModules(options: ClientModulesOptions = {}): Plugin {
  let root = resolve(options.root ?? process.cwd());
  const serverOnly = (id: string) =>
    /\.server\.[cm]?[jt]sx?(?:\?|$)/.test(id) ||
    isBuiltin(id) ||
    /^(tenoncms(?:$|\/(?:libsql|sqlite|postgres|pglite|cloudflare|email)(?:\/|$))|server-only$)/.test(
      id,
    );
  const browserModules = new Set<string>();

  return {
    name: "tenoncms:client-modules",
    enforce: "pre",
    configResolved(config) {
      root = resolve(options.root ?? config.root);
    },
    async resolveId(source, importer, hookOptions) {
      const server =
        options.server ?? hookOptions.ssr ?? this.environment?.config.consumer === "server";
      if (server || !importer || source.startsWith("\0")) return;
      // Only modules the browser transforms import for the browser. Vite's dependency scan and the
      // `clientRef()` crawl read server files, such as Astro frontmatter, without transforming them.
      // Vite dev also adds the crawl's watched files as imports of the registry. `load()` still
      // rejects a server-only module that the registry loads.
      if (!browserModules.has(importer) || importer === REGISTRY_ID) return;
      if (serverOnly(source))
        this.error(`tenoncms: browser module ${importer} imports server-only module ${source}`);
      const target = await this.resolve(source, importer, { skipSelf: true });
      if (target && serverOnly(target.id))
        this.error(`tenoncms: browser module ${importer} imports server-only module ${target.id}`);
      return target;
    },
    transform(_code, id, hookOptions) {
      const server =
        options.server ?? hookOptions?.ssr ?? this.environment?.config.consumer === "server";
      if (!server) browserModules.add(id);
    },
    async load(id, hookOptions) {
      const server =
        options.server ?? hookOptions?.ssr ?? this.environment?.config.consumer === "server";
      if (!server && serverOnly(id))
        this.error(`tenoncms: server-only module ${id} cannot load in the browser`);
      if (!server || !isClientModule(id)) return;
      const file = id.split("?")[0];
      this.addWatchFile(file);
      const names = await clientModuleExports(
        file,
        async (source, importer) =>
          (await this.resolve(source, importer, { skipSelf: true }))?.id ?? null,
      );
      const local = clientModuleId(root, file);
      const specifier = options.references?.[local] ?? local;
      return (
        `import { clientRef } from "tenoncms/admin";\n` +
        [...names]
          .map(
            (name, index) =>
              `const ref${index} = clientRef(${JSON.stringify(`${specifier}#${name}`)}); export { ref${index} as ${JSON.stringify(name)} };`,
          )
          .join("\n")
      );
    },
  };
}
