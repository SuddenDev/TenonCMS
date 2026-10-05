import type { AstroIntegration } from "astro";
import { fileURLToPath } from "node:url";
import { adminAlias } from "../admin/build.ts";
import { faviconDefine } from "../admin/favicon.ts";
import { adminPath } from "../admin/path.ts";
import type { AdapterOptions } from "../admin/types.ts";
import { API_BASE } from "../../client/index.ts";

/** Options of the Astro integration. */
export type Options = AdapterOptions & {
  /**
   * Injects the preview runtime into every page. In the admin's preview it shows unsaved changes; after a save it
   * re-renders the page from the server, and prerendered pages only get the unsaved changes. A signed-in user with
   * the preview cookie gets the admin bar, unless `admin` is `false`.
   * `false` leaves it out. Defaults to `true`.
   */
  preview?: boolean;
};

/**
 * Astro integration for integral-cms. Injects `/api/cms`, the admin page and the preview runtime, and sets
 * `Astro.locals.integral` to the CMS instance of the request's user.
 * @example
 * // astro.config.mjs
 * integrations: [integralCms({ admin: '/cms' })]
 */
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
          const adminDir = fileURLToPath(new URL("../../admin/", import.meta.url));
          alias["#integral/admin"] = adminAlias(fileURLToPath(config.root), adminDir);
        }

        if (preview) {
          const options = `{ morph: true, admin: ${JSON.stringify(path ?? false)} }`;
          injectScript(
            "page",
            `import { preview } from 'integral-cms/preview'; preview(${options});`,
          );
        }

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
        const module = JSON.stringify(entryPath.replace(/\.[cm]?[jt]s$/, ""));
        injectTypes({ filename: "types.d.ts", content: localsTypes(module) });
        injectTypes({ filename: "config.d.ts", content: configTypes(module) });
      },
    },
  };
}

// Types `Astro.locals.integral` and the client's `Register`.
// `export {}` makes it a module, so `declare module` augments the client instead of replacing it.
function localsTypes(module: string) {
  return `declare global {
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
`;
}

// Types the `#integral/config` alias.
// No `export {}`: the declaration MUST stay ambient to declare the alias.
function configTypes(module: string) {
  return `declare module '#integral/config' {
  const cms: typeof import(${module}).default
  export default cms
}
`;
}
