import type { Schema } from "../schema/index.ts";
import type { Plugin } from "./types.ts";

// Route prefixes core uses under `/api/cms`.
const reserved = ["auth", "collections", "globals", "schema", "media", "preview"];

/** The host's schema with every plugin's collections and globals. Throws for duplicate or invalid names. */
export function mergePlugins(plugins: readonly Plugin[], schema: Schema): Required<Schema> {
  const fail = (message: string) => {
    throw new Error(`integral-cms: ${message}`);
  };
  const collections = { ...schema.collections };
  const globals = { ...schema.globals };
  const names = new Set<string>();
  const own = (name: string) => {
    if (name === "media") fail(`collection name "media" is reserved for the media library`);
  };
  Object.keys(collections).forEach(own);
  for (const plugin of plugins) {
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(plugin.name) || reserved.includes(plugin.name))
      fail(`invalid plugin name "${plugin.name}"`);
    if (names.has(plugin.name)) fail(`duplicate plugin "${plugin.name}"`);
    names.add(plugin.name);
    for (const [name, collection] of Object.entries(plugin.collections ?? {})) {
      own(name);
      if (Object.hasOwn(collections, name)) fail(`duplicate collection "${name}"`);
      collections[name] = collection;
    }
    for (const [name, global] of Object.entries(plugin.globals ?? {})) {
      if (Object.hasOwn(globals, name)) fail(`duplicate global "${name}"`);
      globals[name] = global;
    }
  }
  return { collections, globals };
}
