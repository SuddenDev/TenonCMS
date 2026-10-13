import type { Schema } from "../../schema/index.ts";
import type { Plugin } from "../../plugins/types.ts";

// Route prefixes core uses under `/api/cms`.
const reserved = ["auth", "collections", "globals", "schema", "media", "preview", "localization"];

/**
 * Add the collections and globals of all plugins to the host's schema
 * @param plugins The plugins in the order they are registered
 * @param schema The host's schema with its own collections and globals
 * @returns A new schema that contains the host's and the plugins' collections and globals
 * @throws If a plugin name is invalid or used twice, or if a collection or global name is already taken
 */
export function mergePlugins(plugins: readonly Plugin[], schema: Schema): Required<Schema> {
  const fail = (message: string) => {
    throw new Error(`integral-cms: ${message}`);
  };
  const checkCollectionName = (name: string) => {
    if (name === "media") fail(`collection name "media" is reserved for the media library`);
  };

  const collections = { ...schema.collections };
  const globals = { ...schema.globals };
  const pluginNames = new Set<string>();

  Object.keys(collections).forEach(checkCollectionName);

  for (const plugin of plugins) {
    if (plugin.name === "admin") fail(`plugin name "admin" is reserved for admin extension routes`);
    // the name becomes a route under /api/cms, so it must be a slug and must not clash with core routes
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(plugin.name) || reserved.includes(plugin.name))
      fail(`invalid plugin name "${plugin.name}"`);
    if (pluginNames.has(plugin.name)) fail(`duplicate plugin "${plugin.name}"`);
    pluginNames.add(plugin.name);

    // add the plugin's collections and globals, but never overwrite one of the host or another plugin
    for (const [name, collection] of Object.entries(plugin.collections ?? {})) {
      checkCollectionName(name);
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
