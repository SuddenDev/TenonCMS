import { resolve } from "node:path";
import {
  addImports,
  addPlugin,
  addServerHandler,
  addTypeTemplate,
  addVitePlugin,
  createResolver,
  defineNuxtModule,
} from "@nuxt/kit";
import type {} from "@nuxt/nitro-server/augments";
import type { NuxtModule } from "@nuxt/schema";
import { API_BASE } from "../../client/index.ts";
import { clientReferences } from "../admin/client-refs/client-references.ts";
import { adminPath } from "../admin/path.ts";
import type { AdapterOptions } from "../admin/types.ts";
import { setupAdmin } from "./lib/setup-admin.ts";
import { libsqlBinaries } from "./lib/libsql.ts";

export type { AdapterOptions as Options };

/**
 * Nuxt module for integral-cms. Mounts `/api/cms`, serves the admin page, adds `useIntegral()` and the preview
 * runtime. Options go under `integralCms` in `nuxt.config.ts`.
 * @example
 * // nuxt.config.ts
 * modules: ['integral-cms/nuxt'],
 * integralCms: { admin: '/cms' }
 */
const integralCms: NuxtModule<AdapterOptions> = defineNuxtModule<AdapterOptions>({
  meta: { name: "integral-cms", configKey: "integralCms" },
  defaults: { entry: "./integral.config.ts", admin: true },
  setup(options, nuxt) {
    const runtime = createResolver(import.meta.url).resolve("./runtime");

    // Nuxt forwards aliases to Nitro and to the generated tsconfig paths.
    nuxt.options.alias["#integral/config"] = resolve(nuxt.options.rootDir, options.entry!);
    nuxt.options.build.transpile.push(runtime);
    addServerHandler({ route: `${API_BASE}/**`, handler: `${runtime}/server/handler` });

    // The admin page, a second client entry in the host's Vite build.
    const path = adminPath(options.admin);
    if (path) setupAdmin(nuxt, path, runtime);

    // `#integral/client-registry`: the browser modules that `clientRef()` calls name.
    addVitePlugin(
      clientReferences(options.entry!, nuxt.options.rootDir) as Parameters<typeof addVitePlugin>[0],
    );

    addImports(
      ["useIntegral", "useLocale", "useAlternates"].map((name) => ({
        name,
        from: `${runtime}/composables`,
      })),
    );

    // The preview runtime reads the admin path for the bars' links; `false` renders no admin bar.
    nuxt.options.runtimeConfig.public.integral = { admin: path ?? false };
    addPlugin({ src: `${runtime}/plugin.client`, mode: "client" });

    // Types `createClient()` from `integral-cms/client` without a type argument.
    addTypeTemplate(
      {
        filename: "types/integral-cms.d.ts",
        getContents: () => `/// <reference types="integral-cms/register" />\nexport {}\n`,
      },
      { nuxt: true, nitro: true },
    );

    nuxt.hook("nitro:config", (config) => {
      config.externals ??= {};
      config.externals.traceInclude = [
        ...(config.externals.traceInclude ?? []),
        ...libsqlBinaries(),
      ];
    });
  },
});

export default integralCms;
