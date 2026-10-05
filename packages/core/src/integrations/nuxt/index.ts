import { resolve } from "node:path";
import {
  addImports,
  addPlugin,
  addServerHandler,
  addTypeTemplate,
  createResolver,
  defineNuxtModule,
} from "@nuxt/kit";
import type {} from "@nuxt/nitro-server/augments";
import type { NuxtModule } from "@nuxt/schema";
import type { AdapterOptions } from "../admin/types.ts";
import { API_BASE } from "../../client/index.ts";
import { adminPath } from "../admin/path.ts";
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

    // setup admin ui
    const path = adminPath(options.admin);
    if (path) setupAdmin(nuxt, path, runtime);

    // The preview runtime. It reads the admin path for the bars' links; `false` renders no admin bar.
    addImports({ name: "useIntegral", from: `${runtime}/composables` });
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
