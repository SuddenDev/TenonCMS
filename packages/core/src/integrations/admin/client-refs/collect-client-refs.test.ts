import { realpath } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { collectClientRefs } from "./collect-client-refs.ts";
import { relativeResolver, removeProjects, tempProject } from "./test-project.ts";

afterEach(removeProjects);

it("discovers aliased calls through static imports without running config", async () => {
  const root = await tempProject({
    "integral.config.ts": `import { clientRef as browser } from 'integral-cms/admin'; import './plugin.ts'; throw new Error('never execute'); const field = browser('./field.ts#color');`,
    "plugin.ts": `import { clientRef } from 'integral-cms/admin'; export const admin = clientRef('my-plugin/admin');`,
    "field.ts": "export const color = () => {}",
    "packaged.mjs": "export default []",
  });
  const refs = await collectClientRefs(
    root,
    [join(root, "integral.config.ts")],
    async (id, importer) =>
      id === "my-plugin/admin" ? join(root, "packaged.mjs") : relativeResolver(id, importer),
  );
  expect(refs).toEqual({
    "./field.ts#color": { file: join(root, "field.ts"), export: "color" },
    "my-plugin/admin": { file: join(root, "packaged.mjs"), export: "default" },
  });
});

it("rejects computed references with an actionable error", async () => {
  const root = await tempProject({
    "integral.config.ts": `import { clientRef } from 'integral-cms/admin'; clientRef('./field' + '.ts');`,
  });
  await expect(
    collectClientRefs(root, [join(root, "integral.config.ts")], async () => null),
  ).rejects.toThrow('literal string, e.g. clientRef("./src/admin/color.ts#mountColor")');
});

it("rejects a reference that does not resolve", async () => {
  const root = await tempProject({
    "integral.config.ts": `import { clientRef } from 'integral-cms/admin'; clientRef('./missing.ts#a');`,
  });
  await expect(
    collectClientRefs(root, [join(root, "integral.config.ts")], async () => null),
  ).rejects.toThrow('cannot resolve clientRef("./missing.ts#a")');
});

it("reports every visited config module", async () => {
  const root = await tempProject({
    "integral.config.ts": `import { admin } from './admin.ts'; import { clientRef } from 'integral-cms/admin'; export default { admin, field: clientRef('./field.ts#color') };`,
    "admin.ts": `import { clientRef } from 'integral-cms/admin'; export const admin = { adminBar: { items: { a: { onClick: clientRef('./bar.ts#a') } } }, fields: { color: { mount: clientRef('./field.ts#color') } } } satisfies object;`,
  });
  const visited: string[] = [];
  const refs = await collectClientRefs(
    root,
    [join(root, "integral.config.ts")],
    relativeResolver,
    (file) => visited.push(file),
  );
  expect(Object.keys(refs).sort()).toEqual(["./bar.ts#a", "./field.ts#color"]);
  expect(refs["./bar.ts#a"].site).toBe(true);
  expect(refs["./field.ts#color"].site).toBeUndefined();
  expect(visited).toEqual([join(root, "integral.config.ts"), join(root, "admin.ts")]);
});

it("tracks imported and re-exported bar references without marking field references", async () => {
  const root = await tempProject({
    "integral.config.ts": `import { barItems } from './plugin.ts'; export default { adminBar: { items: barItems } };`,
    "plugin.ts": `export { items as barItems } from './refs.ts';`,
    "refs.ts": `import { clientRef } from 'integral-cms/admin'; export const items = clientRef('./bar.ts'); export const color = clientRef('./field.ts');`,
  });
  const refs = await collectClientRefs(root, [join(root, "integral.config.ts")], relativeResolver);
  expect(refs["./bar.ts"].site).toBe(true);
  expect(refs["./field.ts"].site).toBeUndefined();
});

it("tracks namespace references through exported factories and star re-exports", async () => {
  const root = await tempProject({
    "integral.config.ts": `import * as refs from './plugin.ts'; export default { adminBar: { items: refs['items']() } };`,
    "plugin.ts": `export * from './refs.ts';`,
    "refs.ts": `import { clientRef } from 'integral-cms/admin'; export function items() { return clientRef('./bar.ts'); }`,
  });
  const refs = await collectClientRefs(root, [join(root, "integral.config.ts")], relativeResolver);
  expect(refs["./bar.ts"].site).toBe(true);
});

it("keeps a reference marked as site when another module also references it as a field", async () => {
  const root = await tempProject({
    "integral.config.ts": `import { clientRef } from 'integral-cms/admin'; export default { fields: { a: clientRef('./a.ts') }, adminBar: { items: clientRef('./a.ts') } };`,
  });
  const refs = await collectClientRefs(root, [join(root, "integral.config.ts")], relativeResolver);
  expect(refs["./a.ts"].site).toBe(true);
});

it("visits a module once however often it is imported", async () => {
  const root = await tempProject({
    "integral.config.ts": `import './a.ts'; import './b.ts';`,
    "a.ts": `import './shared.ts';`,
    "b.ts": `import './shared.ts'; import './a.ts';`,
    "shared.ts": `import './shared.ts';`,
  });
  const visited: string[] = [];
  await collectClientRefs(root, [join(root, "integral.config.ts")], relativeResolver, (file) =>
    visited.push(file),
  );
  expect(visited.map((file) => file.slice(root.length + 1))).toEqual([
    "integral.config.ts",
    "a.ts",
    "shared.ts",
    "b.ts",
  ]);
});

it("resolves packaged plugin references through package exports", async () => {
  const root = await tempProject({
    "integral.config.ts": `import plugin from 'test-plugin'; export default plugin;`,
    "node_modules/test-plugin/package.json": JSON.stringify({
      name: "test-plugin",
      type: "module",
      exports: { ".": "./server.mjs", "./admin": "./browser.mjs" },
    }),
    "node_modules/test-plugin/server.mjs": `import { clientRef } from 'integral-cms/admin'; export default { admin: { pages: { report: { mount: clientRef('test-plugin/admin#mountReport') } } } };`,
    "node_modules/test-plugin/browser.mjs": "export const mountReport = () => {};",
  });
  const { createServer } = await import("vite");
  const server = await createServer({
    root,
    configFile: false,
    server: { middlewareMode: true, hmr: false },
    optimizeDeps: { noDiscovery: true },
    appType: "custom",
  });
  try {
    const refs = await collectClientRefs(
      root,
      [join(root, "integral.config.ts")],
      async (id, importer) =>
        (await server.environments.client.pluginContainer.resolveId(id, importer))?.id ?? null,
    );
    expect(refs["test-plugin/admin#mountReport"]).toMatchObject({
      file: await realpath(join(root, "node_modules/test-plugin/browser.mjs")),
      export: "mountReport",
    });
  } finally {
    await server.close();
  }
});
