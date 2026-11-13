import { resolve } from "node:path";
import {
  addComponent,
  addImports,
  addPlugin,
  addServerHandler,
  addTypeTemplate,
  addVitePlugin,
  createResolver,
  defineNuxtModule,
  hasNuxtModule,
} from "@nuxt/kit";
import type {} from "@nuxt/nitro-server/augments";
import type { NuxtModule } from "@nuxt/schema";
import { API_BASE } from "../../client/index.ts";
import { clientModules } from "../admin/client-refs/client-modules.ts";
import { clientReferences } from "../admin/client-refs/client-references.ts";
import { adminPath } from "../admin/path.ts";
import type { AdapterOptions } from "../admin/types.ts";
import { setupAdmin } from "./lib/setup-admin.ts";
import { libsqlBinaries } from "./lib/libsql.ts";
import { siteRoutes } from "../admin/seo-routes.ts";
import { JOBS_TASK, withJobsTask } from "../nitro-jobs.ts";

export type { AdapterOptions as Options };

/**
 * Nuxt module for tenoncms. Mounts `/_tenon`, `/sitemap.xml` and `/robots.txt`, serves the admin page, adds
 * `useTenon()`, `useTenonSeo()`, the components `TenonLink`, `TenonBlocks`, `TenonImage`, `TenonPicture` and `TenonRichtext`, and the preview
 * runtime. It also schedules the Nitro task `tenon:jobs` every minute, unless `jobs` is `false`. Options go under
 * `tenonCms` in `nuxt.config.ts`.
 * @example
 * // nuxt.config.ts
 * modules: ['tenoncms/nuxt'],
 * tenonCms: { admin: '/cms' }
 */
const tenonCms: NuxtModule<AdapterOptions> = defineNuxtModule<AdapterOptions>({
  meta: { name: "tenoncms", configKey: "tenonCms" },
  defaults: { entry: "./tenon.config.ts", admin: true },
  setup(options, nuxt) {
    const runtime = createResolver(import.meta.url).resolve("./runtime");
    if (nuxt.options.dev)
      nuxt.hook("listen", (_server, listener: { url: string }) => {
        process.env.__TENON_DEV_ORIGIN = new URL(listener.url).origin;
      });

    // Nuxt forwards aliases to Nitro and to the generated tsconfig paths.
    nuxt.options.alias["#tenon/config"] = resolve(nuxt.options.rootDir, options.entry!);
    nuxt.options.build.transpile.push(runtime);
    // A linked install would resolve its own copy of Vue from the tenoncms checkout.
    const resolveOptions = (nuxt.options.vite.resolve ??= {});
    resolveOptions.dedupe = [...(resolveOptions.dedupe ?? []), "vue", "vue-router"];
    addServerHandler({ route: `${API_BASE}/**`, handler: `${runtime}/server/handler` });

    // Nitro registers module handlers after the host's `server/routes`, so the same route here would win. The
    // host's own route, `public/` file or SEO module wins instead.
    const routes = siteRoutes(
      {
        sitemap: options.sitemap !== false && !hasNuxtModule("@nuxtjs/sitemap", nuxt),
        robots: options.robots !== false && !hasNuxtModule("@nuxtjs/robots", nuxt),
      },
      resolve(nuxt.options.rootDir, nuxt.options.dir.public),
      [resolve(nuxt.options.serverDir, "routes")],
    );
    for (const route of routes) addServerHandler({ route, handler: `${runtime}/server/handler` });

    // The admin page, a second client entry in the host's Vite build.
    const path = adminPath(options.admin);
    if (path) setupAdmin(nuxt, path, runtime);

    // `#tenon/client-registry`: the browser modules that `clientRef()` calls name.
    addVitePlugin(
      clientModules({ root: nuxt.options.rootDir }) as Parameters<typeof addVitePlugin>[0],
    );
    addVitePlugin(
      clientReferences(options.entry!, nuxt.options.rootDir) as Parameters<typeof addVitePlugin>[0],
    );

    addImports([
      ...["useTenon", "useTenonSeo", "useLocale", "useAlternates", "useLivePreview"].map(
        (name) => ({
          name,
          from: `${runtime}/composables`,
        }),
      ),
      { name: "useBlockEdit", from: "tenoncms/vue" },
    ]);
    addComponent({ name: "TenonLink", filePath: `${runtime}/components/link` });
    for (const name of ["Blocks", "Image", "Picture", "Richtext"])
      addComponent({ name: `Tenon${name}`, export: name, filePath: "tenoncms/vue" });

    // The preview runtime reads the admin path for the bars' links; `false` renders no admin bar.
    nuxt.options.runtimeConfig.public.tenon = { admin: path ?? false };
    addPlugin(`${runtime}/plugin`);

    // Types `createClient()` from `tenoncms/client` without a type argument.
    addTypeTemplate(
      {
        filename: "types/tenoncms.d.ts",
        getContents: () => `/// <reference types="tenoncms/register" />\nexport {}\n`,
      },
      { nuxt: true, nitro: true },
    );

    nuxt.hook("nitro:config", (config) => {
      config.rollupConfig ??= {};
      config.rollupConfig.plugins = [
        clientModules({ root: nuxt.options.rootDir, server: true }) as NonNullable<
          typeof config.rollupConfig.plugins
        >[number],
        ...(config.rollupConfig.plugins ?? []),
      ];
      config.externals ??= {};
      config.externals.traceInclude = [
        ...(config.externals.traceInclude ?? []),
        ...libsqlBinaries(),
      ];

      if (options.jobs === false) return;
      config.experimental = { ...config.experimental, tasks: true };
      config.tasks = {
        ...config.tasks,
        [JOBS_TASK]: { handler: `${runtime}/server/jobs-task`, description: "Runs the due jobs" },
      };
      config.scheduledTasks = withJobsTask(config.scheduledTasks);
    });
  },
});

export default tenonCms;
