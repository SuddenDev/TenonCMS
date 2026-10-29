import { join } from "node:path";
import { parseAst } from "vite";
import { afterEach, expect, it } from "vitest";
import { describeModule, isScript, nameOf, parseModule } from "./module-syntax.ts";
import { removeProjects, tempProject } from "./test-project.ts";

afterEach(removeProjects);

const describe = (code: string) => describeModule(parseAst(code));

it("tells scripts from other files", () => {
  expect(["a.ts", "a.tsx", "a.js", "a.mjs", "a.cts", "a.jsx"].every(isScript)).toBe(true);
  expect(["a.vue", "a.css", "a.json", "a.ts.map"].some(isScript)).toBe(false);
});

it("reads identifier and literal names", () => {
  expect(nameOf({ name: "a" })).toBe("a");
  expect(nameOf({ value: "b" })).toBe("b");
  expect(nameOf(undefined)).toBeUndefined();
});

it("reads import bindings and the names that tenoncms/admin was imported under", () => {
  const info = describe(`
    import { clientRef as ref, other } from 'tenoncms/admin';
    import * as admin from 'tenoncms/admin';
    import plugin, * as all from './plugin.ts';
    import { clientRef } from './not-admin.ts';
  `);
  expect([...info.clientRefNames]).toEqual(["ref"]);
  expect([...info.adminNamespaces]).toEqual(["admin"]);
  expect(info.bindings.get("ref")).toEqual({ source: "tenoncms/admin", exported: "clientRef" });
  expect(info.bindings.get("plugin")).toEqual({ source: "./plugin.ts", exported: "default" });
  expect(info.bindings.get("all")).toEqual({ source: "./plugin.ts", exported: "*" });
  expect(info.sources).toEqual([
    "tenoncms/admin",
    "tenoncms/admin",
    "./plugin.ts",
    "./not-admin.ts",
  ]);
});

it("reads exports, re-exports and star exports", () => {
  const info = describe(`
    const local = 1;
    export const a = 1, b = 2;
    export function f() {}
    export default local;
    export { local as renamed };
    export { x as y } from './other.ts';
    export * from './star.ts';
  `);
  expect([...info.exports.keys()]).toEqual(["a", "b", "f", "default", "renamed"]);
  expect(info.exports.get("renamed").name).toBe("local");
  expect(info.reexports.get("y")).toEqual({ source: "./other.ts", exported: "x" });
  expect(info.stars).toEqual(["./star.ts"]);
  expect(info.sources).toEqual(["./other.ts", "./star.ts"]);
});

it("reads declarations at any depth, the last declaration of a name winning", () => {
  const info = describe(`
    const a = 1;
    function f() { const nested = 2; const a = 3; }
  `);
  expect([...info.declarations.keys()].sort()).toEqual(["a", "f", "nested"]);
  expect(info.declarations.get("a").value).toBe(3);
});

it("parses TypeScript and the script blocks of a Vue file", async () => {
  const root = await tempProject({
    "a.ts": "import type { T } from './t.ts'; export const a: T = 1 as T;",
    "b.vue": `<template><p /></template><script lang="ts">import './b.ts'</script><script setup lang="ts">import './c.ts'</script><style>p {}</style>`,
  });
  expect(describeModule(await parseModule(join(root, "a.ts"))).exports.has("a")).toBe(true);
  expect(describeModule(await parseModule(join(root, "b.vue"))).sources).toEqual([
    "./b.ts",
    "./c.ts",
  ]);
});
