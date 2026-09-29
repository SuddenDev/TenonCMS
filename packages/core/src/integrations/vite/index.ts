import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin, ViteDevServer } from "vite";
import {
  adminAlias,
  adminChunk,
  adminHtml,
  adminInput,
  adminPath,
  faviconDefine,
  type AdminOption,
} from "../../admin/html.ts";

const adminDir = fileURLToPath(new URL("../../admin/", import.meta.url));
const entry = `${adminDir}entry.ts`;
const virtualId = "\0integral-admin-html";

/**
 * Builds the admin as a second client entry and exposes its page as `#integral/admin-html`.
 * For Vite frameworks without an adapter. Also keeps core external in SSR builds. Serve the page from a server route for `/admin` and `/admin/*`.
 * With `path`, the server route MUST match it, e.g. `src/routes/cms.$.ts` for `/cms`.
 * @example
 * // vite.config.ts
 * plugins: [tanstackStart(), integralAdmin()]
 *
 * // src/routes/admin.$.ts
 * import html from '#integral/admin-html'
 * GET: () => new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } })
 */
export function integralAdmin({
  path: option = true,
}: { path?: Exclude<AdminOption, false> } = {}): Plugin {
  const path = adminPath(option)!;
  let server: ViteDevServer | undefined;
  let html = "";
  return {
    name: "integral-cms:admin",
    config: (config, { command }) => ({
      resolve: { alias: { "#integral/admin": adminAlias(config.root ?? process.cwd(), adminDir) } },
      define: faviconDefine(resolve(config.root ?? process.cwd(), config.publicDir || "public")),
      // Bundling core breaks libsql's native binding. Dev does not bundle, so Vite reloads core when `dist/` changes.
      ssr: command === "build" ? { external: ["integral-cms"] } : {},
    }),
    configEnvironment: adminInput(entry),
    configureServer(s) {
      server = s;
    },
    generateBundle(_, bundle) {
      if (this.environment.name !== "client") return;
      const base = this.environment.config.base;
      const chunk = Object.values(bundle).find(
        (c) => c.type === "chunk" && c.isEntry && c.name === adminChunk,
      );
      if (chunk?.type !== "chunk") return;
      // Frameworks may expect a single client entry, e.g. TanStack Start throws on a second one.
      chunk.isEntry = false;
      html = adminHtml(
        path,
        [base + chunk.fileName],
        [...(chunk.viteMetadata?.importedCss ?? [])].map((file) => base + file),
      );
    },
    resolveId: (id) => (id === "#integral/admin-html" ? virtualId : undefined),
    async load(id) {
      if (id !== virtualId) return;
      // Dev: Vite's HTML transforms add its client and framework preambles, e.g. React Refresh.
      if (this.environment.config.command === "serve" && server)
        html = await server.transformIndexHtml(path, adminHtml(path, [`/@fs${entry}`]));
      return `export default ${JSON.stringify(html)}`;
    },
  };
}
