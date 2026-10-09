import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { clientReferences } from "./client-references.ts";
import { removeProjects, tempProject } from "./test-project.ts";

afterEach(removeProjects);

type Context = {
  resolve(source: string, importer: string): Promise<{ id: string } | null>;
  addWatchFile(file: string): void;
};

// Runs the plugin's hooks the way Vite does, with a resolver for relative imports.
function setup(root: string, ...args: Parameters<typeof clientReferences>) {
  const plugin = clientReferences(...args) as unknown as {
    configResolved(options: { root: string }): void;
    resolveId(id: string): string | undefined;
    load(this: Context, id: string): Promise<string | undefined>;
  };
  plugin.configResolved({ root });
  const watched: string[] = [];
  const context: Context = {
    resolve: async (source, importer) =>
      source.startsWith(".")
        ? { id: join(importer.slice(0, importer.lastIndexOf("/")), source) }
        : null,
    addWatchFile: (file) => watched.push(file),
  };
  const load = () => plugin.load.call(context, plugin.resolveId("#integral/client-registry")!);
  return { plugin, watched, load };
}

it("claims only the registry id", async () => {
  const { plugin, load } = setup("/project");
  expect(plugin.resolveId("#integral/client-registry")).toBe("\0integral-client-registry");
  expect(plugin.resolveId("other")).toBeUndefined();
  expect(await plugin.load.call({} as Context, "other")).toBeUndefined();
  expect(load).toBeDefined();
});

it("serves a lazy import for every reference", async () => {
  const root = await tempProject({
    "integral.config.ts": `import { clientRef } from 'integral-cms/admin'; export default { a: clientRef('./field.ts#color'), b: clientRef('./page.ts') };`,
    "field.ts": "export const color = () => {}",
    "page.ts": "export default () => {}",
  });
  const { load, watched } = setup(root);

  const field = join(root, "field.ts");
  const page = join(root, "page.ts");
  expect(await load()).toBe(
    `export default {` +
      `"./field.ts#color": () => import(${JSON.stringify(field)}).then(m => { const value = m["color"]; if (value === undefined) throw new Error("integral-cms: missing export \\"color\\" in clientRef(\\"./field.ts#color\\")"); return value; }),` +
      `"./page.ts": () => import(${JSON.stringify(page)}).then(m => { const value = m["default"]; if (value === undefined) throw new Error("integral-cms: missing export \\"default\\" in clientRef(\\"./page.ts\\")"); return value; })` +
      `}`,
  );
  expect(watched).toEqual([join(root, "integral.config.ts"), field, page]);
});

it("serves an empty registry for a configuration without references", async () => {
  const root = await tempProject({ "integral.config.ts": "export default {}" });
  expect(await setup(root).load()).toBe("export default {}");
});

it("reads the configuration from the entry option and the project root option", async () => {
  const root = await tempProject({ "custom.ts": "export default {}" });
  const { load, watched } = setup("/elsewhere", "./custom.ts", root);
  await load();
  expect(watched).toEqual([join(root, "custom.ts")]);
});

it("rejects eager CSS in the admin bar's graph", async () => {
  const root = await tempProject({
    "integral.config.ts": `import { clientRef } from 'integral-cms/admin'; export default { adminBar: { items: clientRef('./bar.ts') } };`,
    "bar.ts": `import './bar.css'; export default [];`,
    "bar.css": ".bar{}",
  });
  await expect(setup(root).load()).rejects.toThrow("eager CSS");
});
