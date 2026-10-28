import type { AstroIntegration } from "astro";
import { fileURLToPath } from "node:url";
import { API_BASE } from "../../client/index.ts";
import { clientReferences } from "../admin/client-refs/client-references.ts";
import { faviconDefine } from "../admin/favicon.ts";
import { adminPath } from "../admin/path.ts";
import type { AdapterOptions } from "../admin/types.ts";

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
 * With the `@astrojs/cloudflare` adapter, the CMS runs in a Durable Object bound as `CMS`: `/api/cms` goes to it, and
 * `Astro.locals.integral` is the HTTP client over it.
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
  let cloudflare = false;
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
        cloudflare = config.adapter?.name === "@astrojs/cloudflare";
        const runtime = cloudflare ? "./cloudflare/" : "./";

        injectRoute({
          pattern: `${API_BASE}/[...path]`,
          entrypoint: new URL(`${runtime}route.ts`, import.meta.url),
          prerender: false,
        });

        const path = adminPath(admin);
        if (path) {
          injectRoute({
            pattern: `${path}/[...path]`,
            entrypoint: new URL("./admin.astro", import.meta.url),
            prerender: false,
          });
        }

        if (preview) {
          const options = `{ morph: true, admin: ${JSON.stringify(path ?? false)} }`;
          injectScript(
            "page",
            `import { preview } from 'integral-cms/preview'; preview(${options});`,
          );
        }

        addMiddleware({
          entrypoint: new URL(`${runtime}middleware.ts`, import.meta.url),
          order: "pre",
        });

        updateConfig({
          vite: {
            plugins: [clientReferences(entry)],
            resolve: { alias: { "#integral/config": entryPath } },
            define: faviconDefine(fileURLToPath(config.publicDir)),
            // Linked workspace packages get bundled by default, which breaks libsql's native binding.
            // Dev does not bundle. Keeping core internal there lets Vite reload it when `dist/` changes.
            // Workers have no native bindings and MUST bundle core.
            ssr: command === "dev" || cloudflare ? {} : { external: ["integral-cms"] },
          },
        });
      },

      // Every wake of the CMS object parses the bundle again. Vite leaves server code unminified by default.
      "astro:build:setup"({ vite, target }) {
        if (cloudflare && target === "server") vite.build = { ...vite.build, minify: true };
      },

      "astro:config:done"({ injectTypes }) {
        // Astro's type injection takes a string. This is the only generated code.
        const module = JSON.stringify(entryPath.replace(/\.[cm]?[jt]s$/, ""));
        injectTypes({ filename: "types.d.ts", content: appTypes(module, cloudflare) });
        injectTypes({ filename: "config.d.ts", content: configTypes(module) });
      },
    },
  };
}

// Types `Astro.locals.integral`, `locale`, `path` and the client's `Register`.
// `export {}` makes it a module, so `declare module` augments the client instead of replacing it.
function appTypes(module: string, cloudflare: boolean) {
  const cms = `typeof import(${module}).default`;
  const integral = cloudflare ? `import('integral-cms/client').Client<${cms}>` : cms;
  return `declare global {
  namespace App {
    interface Locals {
      integral: ${integral}
      locale: import('integral-cms/client').Locale<typeof import(${module}).default> | undefined
      path: string
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
