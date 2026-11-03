import { join } from "node:path";
import { build, createServer, type InlineConfig, type Plugin } from "vite";
import { afterEach, expect, it } from "vitest";
import { clientModules } from "./client-modules.ts";
import { clientReferences } from "./client-references.ts";
import { removeProjects, tempProject } from "./test-project.ts";

afterEach(removeProjects);

async function bundle(root: string, entry: string, server = false, options: InlineConfig = {}) {
  const result = await build({
    configFile: false,
    root,
    logLevel: "silent",
    plugins: [clientModules(), clientReferences()],
    build: {
      write: false,
      minify: false,
      ssr: server,
      lib: { entry: join(root, entry), formats: ["es"] },
      rolldownOptions: { external: ["tenoncms/admin"] },
    },
    ...options,
  });
  const outputs = Array.isArray(result) ? result : [result];
  return outputs
    .flatMap((output) => ("output" in output ? output.output : []))
    .filter((chunk) => chunk.type === "chunk")
    .map((chunk) => chunk.code)
    .join("\n");
}

it("keeps browser imports and closures out of the server, and registers them for the browser", async () => {
  const root = await tempProject({
    "config.server.ts": `export const secret = "server secret";`,
    "tenon.config.ts": `import { secret } from "./config.server.ts"; import { description } from './price.client.ts'; export default { description, secret };`,
    "entry.ts": `export { default } from '#tenon/client-registry';`,
    "price.client.ts": `import { limit } from './money.ts'; window.browserOnly = true; export const description = ({value}) => value > limit ? 'Approval' : 'Price';`,
    "money.ts": `export const limit = 1000;`,
  });
  const server = await bundle(root, "tenon.config.ts", true);
  expect(server).toContain("./price.client.ts#description");
  expect(server).not.toContain("browserOnly");
  expect(server).not.toContain("1000");
  const browser = await bundle(root, "entry.ts");
  expect(browser).toContain("./price.client.ts#description");
  expect(browser).toContain("browserOnly");
  expect(browser).toMatch(/1000|1e3/);
});

it.each(["./secret.server.ts", "node:fs"])(
  "rejects a transitive browser import of %s",
  async (source) => {
    const root = await tempProject({
      "entry.ts": `export { value } from './widget.client.ts';`,
      "widget.client.ts": `export { value } from './helper.ts';`,
      "helper.ts": `import * as secret from '${source}'; export const value = secret;`,
      "secret.server.ts": `export const password = 'private';`,
    });
    await expect(bundle(root, "entry.ts")).rejects.toThrow(/server-only/);
  },
);

it("allows erased server type imports and ordinary shared modules", async () => {
  const root = await tempProject({
    "entry.client.ts": `import type { Secret } from './secret.server.ts'; import { label } from './shared.ts'; export const value: Secret = { label };`,
    "secret.server.ts": `export type Secret = { label: string }; throw new Error('never execute');`,
    "shared.ts": `export const label = 'Shared';`,
  });
  expect(await bundle(root, "entry.client.ts")).toContain("Shared");
});

it("ignores server modules the browser never loads, even when another plugin drops resolve options", async () => {
  const root = await tempProject({
    "db.server.ts": `export const db = 'private';`,
    "tenon.config.ts": `import { db } from './db.server.ts'; import { label } from './label.client.ts'; export default { db, label };`,
    "label.client.ts": `export const label = 'Label';`,
    "entry.ts": `export { default } from '#tenon/client-registry';`,
  });
  // Mirrors Astro plugins that re-resolve with `{ skipSelf: true }` only.
  const dropsOptions: Plugin = {
    name: "drops-options",
    enforce: "pre",
    resolveId(source, importer) {
      return this.resolve(source, importer, { skipSelf: true });
    },
  };
  const browser = await bundle(root, "entry.ts", false, {
    plugins: [dropsOptions, clientModules(), clientReferences()],
  });
  expect(browser).toContain("./label.client.ts#label");
});

it("ignores watched server files in the dev module graph", async () => {
  const root = await tempProject({
    "db.server.ts": `export const db = 'private';`,
    "tenon.config.ts": `import { db } from './db.server.ts'; import { label } from './label.client.ts'; export default { db, label };`,
    "label.client.ts": `export const label = 'Label';`,
    "leak.client.ts": `export { db } from './db.server.ts';`,
  });
  const server = await createServer({
    configFile: false,
    root,
    logLevel: "silent",
    plugins: [clientModules(), clientReferences()],
    server: { middlewareMode: true, ws: false, watch: null },
    optimizeDeps: { noDiscovery: true },
  });
  try {
    const client = server.environments.client;
    const registry = "#tenon/client-registry";
    await client.transformRequest(registry);
    client.moduleGraph.invalidateAll();
    expect((await client.transformRequest(registry))?.code).toContain("./label.client.ts");
    await expect(client.transformRequest("/leak.client.ts")).rejects.toThrow("server-only");
  } finally {
    await server.close();
  }
});

it("rejects server-only browser entry points", async () => {
  const root = await tempProject({ "entry.server.ts": `export const password = 'private';` });
  await expect(bundle(root, "entry.server.ts")).rejects.toThrow("server-only");
});

it("checks aliases and lazy imports", async () => {
  const root = await tempProject({
    "entry.client.ts": `export const load = () => import('private-module');`,
    "secret.server.ts": `export default 'private';`,
  });
  await expect(
    bundle(root, "entry.client.ts", false, {
      resolve: { alias: { "private-module": join(root, "secret.server.ts") } },
    }),
  ).rejects.toThrow("server-only");
});

it("preserves default and re-exported browser registrations", async () => {
  const root = await tempProject({
    "tenon.config.ts": `import mount, { help } from './ui.client.ts'; export default { mount, help };`,
    "ui.client.ts": `export { mount as default } from './view.ts'; export * from './help.ts';`,
    "view.ts": `export const mount = (el) => { el.textContent = 'View'; return () => el.replaceChildren(); };`,
    "help.ts": `export const { help } = { help: () => 'Help' };`,
  });
  const server = await bundle(root, "tenon.config.ts", true);
  expect(server).toContain("./ui.client.ts#default");
  expect(server).toContain("./ui.client.ts#help");
  expect(server).not.toContain("textContent");
});

it("emits portable literal references for a plugin server build", async () => {
  const root = await tempProject({
    "plugin.ts": `import { mount } from './ui.client.ts'; export default { admin: { pages: { stats: { mount } } } };`,
    "ui.client.ts": `export const mount = (el) => { el.textContent = 'View'; return () => {}; };`,
  });
  const server = await bundle(root, "plugin.ts", true, {
    plugins: [
      clientModules({ server: true, root, references: { "./ui.client.ts": "my-plugin/admin" } }),
    ],
  });
  expect(server).toContain("my-plugin/admin#mount");
  expect(server).toContain('from "tenoncms/admin"');
  expect(server).not.toContain("textContent");
});
