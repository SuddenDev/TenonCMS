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
import { adminAlias, adminPath } from "../../admin/path.ts";
import { adminChunk, adminInput } from "../../admin/input.ts";
import { adminHtml } from "../../admin/html.ts";
import { faviconDefine } from "../../admin/favicon.ts";
import { type Options } from "../../admin/options.ts";
import { API_BASE } from "../../client/index.ts";
import { createRequire, findPackageJSON } from "node:module";
import { resolve } from "node:path";

export type { Options };

const integralCms: NuxtModule<Options> = defineNuxtModule<Options>({
  meta: { name: "integral-cms", configKey: "integralCms" },
  defaults: { entry: "./integral.config.ts", admin: true },
  setup(options, nuxt) {
    const runtime = createResolver(import.meta.url).resolve("./runtime");
    // Nuxt forwards aliases to Nitro and to the generated tsconfig paths.
    nuxt.options.alias["#integral/config"] = resolve(nuxt.options.rootDir, options.entry!);
    nuxt.options.build.transpile.push(runtime);
    addServerHandler({ route: `${API_BASE}/**`, handler: `${runtime}/server/handler` });
    const path = adminPath(options.admin);
    if (path) {
      const adminDir = resolve(runtime, "../../../admin");
      nuxt.options.alias["#integral/admin"] = adminAlias(nuxt.options.rootDir, adminDir);
      // The admin is a second browser entry in the host's Vite build, served on a page of its own.
      const entry = resolve(adminDir, "entry.ts");
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
        html = adminHtml(
          path,
          [assets + chunk.file],
          (chunk.css ?? []).map((css) => assets + css),
        );
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
    addImports({ name: "useIntegral", from: `${runtime}/composables` });
    // The preview runtime. It reads the admin path for the bars' links; `false` renders no admin bar.
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

// libsql loads its native binary with a dynamic require, which Nitro's file tracer cannot follow.
function libsqlBinaries() {
  const client = createRequire(import.meta.url).resolve("@libsql/client");
  const pkg = findPackageJSON("libsql", client)!;
  const require = createRequire(pkg);
  return Object.keys(require(pkg).optionalDependencies).flatMap((name) => {
    try {
      return [require.resolve(name)];
    } catch {
      // Binaries for other platforms are not installed.
      return [];
    }
  });
}

export default integralCms;
