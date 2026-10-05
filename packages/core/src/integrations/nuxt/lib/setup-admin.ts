import { resolve } from "node:path";
import { addServerHandler, addVitePlugin } from "@nuxt/kit";
import type {} from "@nuxt/nitro-server/augments";
import type { Nuxt } from "@nuxt/schema";
import { adminAlias, adminChunk, adminInput } from "../../admin/build.ts";
import { faviconDefine } from "../../admin/favicon.ts";
import { adminHtml } from "../../admin/html.ts";

/**
 * Serves the admin on `path`: a second browser entry in the host's Vite build, on a page of its own.
 * Sets the `#integral/admin` alias, the Vite plugin, the `#integral/admin-html` virtual module and the routes.
 * @param runtime Absolute path of the module's `runtime/` folder.
 */
export function setupAdmin(nuxt: Nuxt, path: string, runtime: string) {
  const adminDir = resolve(runtime, "../../../admin");
  const entry = resolve(adminDir, "entry.ts");
  nuxt.options.alias["#integral/admin"] = adminAlias(nuxt.options.rootDir, adminDir);

  // Dev serves the entry through Vite. A build replaces the page once the client manifest exists.
  const assets = nuxt.options.app.baseURL.replace(/\/$/, "") + nuxt.options.app.buildAssetsDir;
  let html = adminHtml(path, [`${assets}@vite/client`, `${assets}@fs${entry}`]);

  addVitePlugin(
    {
      name: "integral-cms:admin",
      configEnvironment: adminInput(entry),
      config: () => ({
        define: faviconDefine(resolve(nuxt.options.rootDir, nuxt.options.dir.public)),
      }),
    },
    { server: false },
  );

  nuxt.hook("build:manifest", (manifest) => {
    if (nuxt.options.dev) return;
    const [key, chunk] = Object.entries(manifest).find(
      ([, c]) => c.isEntry && c.name === adminChunk,
    )!;
    // Nuxt preloads every manifest entry on every page. The admin MUST stay off the host's pages.
    delete manifest[key];
    const css = (chunk.css ?? []).map((file) => assets + file);
    html = adminHtml(path, [assets + chunk.file], css);
  });

  nuxt.hook("nitro:config", (config) => {
    config.virtual ??= {};
    // A function, because Nitro builds after the client manifest exists.
    config.virtual["#integral/admin-html"] = () => `export default ${JSON.stringify(html)}`;
  });

  // `/admin/**` does not match `/admin` itself.
  for (const route of [path, `${path}/**`])
    addServerHandler({ route, handler: `${runtime}/server/admin` });
}
