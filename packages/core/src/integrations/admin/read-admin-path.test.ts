import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { relativeResolver, removeProjects, tempProject } from "./client-refs/test-project.ts";
import { configResolver, readAdminPath } from "./read-admin-path.ts";

afterEach(removeProjects);

const SHAPE_ERROR = "admin.path in tenon.config.ts must be a string or process.env.NAME";

async function read(files: Record<string, string>, env: Record<string, string> = {}) {
  const root = await tempProject(files);
  return readAdminPath(join(root, "tenon.config.ts"), relativeResolver, env);
}

const config = (options: string, head = "") =>
  `import { defineCms } from 'tenoncms'; ${head} export default defineCms({ collections: {}, ${options} });`;

it.each([
  ["no admin", config("")],
  ["no admin.path", config("admin: { media: {} },")],
  [
    "a path without the env var's fallback",
    config("admin: { path: process.env.TENON_ADMIN_PATH },"),
  ],
])("defaults to /admin for %s", async (_, code) => {
  expect((await read({ "tenon.config.ts": code })).path).toBe("/admin");
});

it("reads admin: false", async () => {
  expect((await read({ "tenon.config.ts": config("admin: false,") })).path).toBe(false);
});

it("normalizes a literal path", async () => {
  const result = await read({ "tenon.config.ts": config(`admin: { path: "/cms/" },`) });
  expect(result).toEqual({ path: "/cms", define: {} });
});

it("reads the env var and defines it for the build", async () => {
  const result = await read(
    { "tenon.config.ts": config(`admin: { path: process.env.TENON_ADMIN_PATH ?? "/cms" },`) },
    { TENON_ADMIN_PATH: "/editor" },
  );
  expect(result).toEqual({
    path: "/editor",
    define: { "process.env.TENON_ADMIN_PATH": JSON.stringify("/editor") },
  });
});

it("falls back to the value after ?? when the env var is unset", async () => {
  const result = await read({
    "tenon.config.ts": config(`admin: { path: process.env.TENON_ADMIN_PATH ?? "/cms" },`),
  });
  expect(result.define["process.env.TENON_ADMIN_PATH"]).toBe(JSON.stringify("/cms"));
});

it("follows identifiers and shorthand properties in the config", async () => {
  const code = `const admin = { path: "/cms" }; const options = { admin }; export default defineCms(options);`;
  expect((await read({ "tenon.config.ts": code })).path).toBe("/cms");
});

it("follows admin options imported from another module", async () => {
  const result = await read({
    "tenon.config.ts": config("admin: adminOptions,", `import { adminOptions } from './admin.ts';`),
    "admin.ts": `export { options as adminOptions } from './options.ts';`,
    "options.ts": `export const options = { path: "/cms" };`,
  });
  expect(result.path).toBe("/cms");
});

it("follows a default export bound to a name", async () => {
  const code = `const cms = defineCms({ admin: false }); export default cms;`;
  expect((await read({ "tenon.config.ts": code })).path).toBe(false);
});

it("uses a property written after a spread", async () => {
  const code = config(`...base, admin: { ...shared, path: "/cms" },`);
  expect((await read({ "tenon.config.ts": code })).path).toBe("/cms");
});

it.each([
  ["a template string", config("admin: { path: `/cms` },")],
  ["a call", config(`admin: { path: adminPath() },`)],
  ["a spread that hides path", config(`admin: { path: "/cms", ...shared },`)],
  ["a spread that hides admin", config(`...base,`)],
  ["a computed env var", config(`admin: { path: process.env["TENON_" + "PATH"] },`)],
  ["a non-string fallback", config(`admin: { path: process.env.TENON_ADMIN_PATH ?? path },`)],
  ["admin: true", config("admin: true,")],
  ["a computed admin", config("admin: makeAdmin(),")],
  ["an import that does not resolve", config("admin,", `import { admin } from 'some-package';`)],
])("rejects %s", async (_, code) => {
  await expect(read({ "tenon.config.ts": code })).rejects.toThrow(SHAPE_ERROR);
});

it("rejects an invalid path", async () => {
  await expect(
    read({ "tenon.config.ts": config(`admin: { path: process.env.P }`) }, { P: "/_tenon" }),
  ).rejects.toThrow('invalid admin path "/_tenon"');
});

it("rejects a defineCms() call without options", async () => {
  await expect(read({ "tenon.config.ts": `export default defineCms();` })).rejects.toThrow(
    "export default defineCms",
  );
});

it("rejects a config without a default export", async () => {
  await expect(read({ "tenon.config.ts": `export const cms = {};` })).rejects.toThrow(
    "export default defineCms",
  );
});

it("resolves relative imports without an extension", async () => {
  const root = await tempProject({
    "tenon.config.ts": config("admin,", `import { admin } from './src/admin';`),
    "src/admin/index.ts": `export const admin = { path: "/cms" };`,
  });
  const result = await readAdminPath(join(root, "tenon.config.ts"), configResolver, {});
  expect(result.path).toBe("/cms");
});
