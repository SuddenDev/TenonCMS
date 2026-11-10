import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin, ViteDevServer } from "vite";
import { adminChunk, adminInput } from "../admin/build.ts";
import { clientModules } from "../admin/client-refs/client-modules.ts";
import { clientReferences } from "../admin/client-refs/client-references.ts";
import { faviconDefine } from "../admin/favicon.ts";
import { adminHtml } from "../admin/html.ts";
import { adminPath } from "../admin/path.ts";
import type { AdminOption } from "../admin/types.ts";
import { JOBS_TASK, withJobsTask } from "../nitro-jobs.ts";

const adminEntry = fileURLToPath(new URL("../../admin/entry.ts", import.meta.url));
const ADMIN_HTML = "#tenon/admin-html";
const ADMIN_HTML_VIRTUAL = "\0tenon-admin-html";

/** Options of `tenonAdmin()`. */
export type TenonAdminOptions = {
  /** Server configuration to scan for browser references. */
  entry?: string;
  /** Path of the admin, e.g. `/cms`. Defaults to `/admin`. The host's server route MUST match it. */
  path?: Exclude<AdminOption, false>;
  /**
   * Runs the due jobs every minute, through a Nitro task. Defaults to `true`. `false` leaves the clock to the host,
   * e.g. on Vercel Hobby, which allows a cron job once a day. Needs Nitro.
   */
  jobs?: boolean;
};

// The part of Nitro's module API that `jobsModule()` uses. Core does not depend on Nitro.
type NitroLike = {
  options: {
    rootDir: string;
    experimental: { tasks?: boolean };
    tasks: Record<string, { handler?: string; description?: string }>;
    scheduledTasks: Record<string, string | (string | undefined)[] | undefined>;
    virtual: Record<string, string>;
  };
};

const JOBS_HANDLER = "#tenon/jobs-task";

// A Nitro module. Nitro registers every Vite plugin that carries a `nitro` key.
function jobsModule(entry: string) {
  return {
    setup({ options }: NitroLike) {
      options.experimental.tasks = true;
      options.virtual[JOBS_HANDLER] =
        `import cms from ${JSON.stringify(resolve(options.rootDir, entry))};
export default {
  meta: { description: "Runs the due jobs" },
  run: async () => ({ result: await cms.jobs.run() }),
};`;
      options.tasks[JOBS_TASK] = { handler: JOBS_HANDLER, description: "Runs the due jobs" };
      options.scheduledTasks = withJobsTask(options.scheduledTasks);
    },
  };
}

/**
 * Vite plugin that adds the admin to Vite frameworks without an adapter, e.g. TanStack Start.
 * It builds the admin as a second client entry, exposes its page as `#tenon/admin-html` and keeps core
 * external in SSR builds. Serve the page from a server route for `/admin` and `/admin/*`, e.g.
 * `src/routes/cms.$.ts` for `/cms`.
 * With Nitro, it also schedules the task `tenon:jobs` every minute, unless `jobs` is `false`.
 * @example
 * // vite.config.ts
 * plugins: [tanstackStart(), tenonAdmin()]
 *
 * // src/routes/admin.$.ts
 * import html from '#tenon/admin-html'
 * GET: () => new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } })
 */
export function tenonAdmin({
  path: option = true,
  entry: configEntry = "./tenon.config.ts",
  jobs = true,
}: TenonAdminOptions = {}): Plugin[] {
  const path = adminPath(option)!;
  let server: ViteDevServer | undefined;
  let html = "";
  return [
    clientModules(),
    clientReferences(configEntry),
    {
      name: "tenoncms:admin",
      ...(jobs && { nitro: jobsModule(configEntry) }),

      config: (config, { command }) => {
        const root = resolve(config.root ?? process.cwd());
        return {
          define: faviconDefine(resolve(root, config.publicDir || "public")),
          // Bundling core breaks libsql's native binding. Dev does not bundle, so Vite reloads core when `dist/` changes.
          ssr: command === "build" ? { external: ["tenoncms"] } : {},
        };
      },

      configEnvironment: adminInput(adminEntry),

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

      resolveId: (id) => (id === ADMIN_HTML ? ADMIN_HTML_VIRTUAL : undefined),

      async load(id) {
        if (id !== ADMIN_HTML_VIRTUAL) return;
        // Dev: Vite's HTML transforms add its client and framework preambles, e.g. React Refresh.
        if (this.environment.config.command === "serve" && server)
          html = await server.transformIndexHtml(path, adminHtml(path, [`/@fs${adminEntry}`]));
        return `export default ${JSON.stringify(html)}`;
      },
    },
  ];
}

export { clientModules, type ClientModulesOptions } from "../admin/client-refs/client-modules.ts";
