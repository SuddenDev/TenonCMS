import type { Collection, Global } from "../schema/index.ts";
import type { Plugin } from "./types.ts";

/** Types a plugin. Use it as the return value of the plugin's factory. */
export function definePlugin<
  const C extends Record<string, Collection> = {},
  const G extends Record<string, Global> = {},
>(plugin: Plugin<C, G>) {
  return plugin;
}
