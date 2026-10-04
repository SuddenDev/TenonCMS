import type { AstroIntegration } from "astro";
import { fileURLToPath } from "node:url";
import { adminAlias, adminPath } from "../../admin/path.ts";
import { faviconDefine } from "../../admin/favicon.ts";
import { type Options as Base } from "../../admin/options.ts";
import { API_BASE } from "../../client/index.ts";

export type Options = Base & {
  /**
   * Injects the preview runtime into every page. In the admin's preview it shows unsaved changes; after a save it
   * re-renders the page from the server, and prerendered pages only get the unsaved changes. A signed-in user with
   * the preview cookie gets the admin bar, unless `admin` is `false`.
   * `false` leaves it out. Defaults to `true`.
   */
  preview?: boolean;
};

export default function integralCms({
  entry = "./integral.config.ts",
  admin = true,
  preview = true,
}: Options = {}): AstroIntegration {
  let entryPath: string;
  return {
    name: "integral-cms",
    hooks: {
      "astro:config:setup"({
        command,
        config,
        injectRoute,
        injectScript,
        addMiddleware,
        updateConfig,
      }) {
        entryPath = fileURLToPath(new URL(entry, config.root));
        const alias: Record<string, string> = { "#integral/config": entryPath };
        injectRoute({
          pattern: `${API_BASE}/[...path]`,
          entrypoint: new URL("./route.ts", import.meta.url),
          prerender: false,
        });
        const path = adminPath(admin);
        if (path) {
          injectRoute({
            pattern: `${path}/[...path]`,
            entrypoint: new URL("./admin.astro", import.meta.url),
            prerender: false,
          });
          alias["#integral/admin"] = adminAlias(
            fileURLToPath(config.root),
            fileURLToPath(new URL("../../admin/", import.meta.url)),
          );
        }
        if (preview)
          injectScript(
            "page",
            `import { preview } from 'integral-cms/preview'; preview({ morph: true, admin: ${JSON.stringify(path ?? false)} });`,
          );
        addMiddleware({ entrypoint: new URL("./middleware.ts", import.meta.url), order: "pre" });
        updateConfig({
          vite: {
            resolve: { alias },
            define: faviconDefine(fileURLToPath(config.publicDir)),
            // Linked workspace packages get bundled by default, which breaks libsql's native binding.
            // Dev does not bundle. Keeping core internal there lets Vite reload it when `dist/` changes.
            ssr: command === "dev" ? {} : { external: ["integral-cms"] },
          },
        });
      },
      "astro:config:done"({ injectTypes }) {
        // Astro's type injection takes a string. This is the only generated code.
        // `export {}` makes it a module, so `declare module` augments the client instead of replacing it.
        const module = JSON.stringify(entryPath.replace(/\.[cm]?[jt]s$/, ""));
        injectTypes({
          filename: "types.d.ts",
          content: `declare global {
  namespace App {
    interface Locals {
      integral: typeof import(${module}).default
    }
  }
}
declare module 'integral-cms/client' {
  interface Register {
    cms: typeof import(${module}).default
  }
}
export {}
`,
        });
        // No `export {}`: the declaration MUST stay ambient to declare the alias.
        injectTypes({
          filename: "config.d.ts",
          content: `declare module '#integral/config' {
  const cms: typeof import(${module}).default
  export default cms
}
`,
        });
      },
    },
  };
}
