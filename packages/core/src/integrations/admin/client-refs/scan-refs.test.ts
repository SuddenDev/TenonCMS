import { parseAst } from "vite";
import { expect, it } from "vitest";
import { describeModule } from "./module-syntax.ts";
import { scanExport, scanModule } from "./scan-refs.ts";

const ADMIN = `import { clientRef } from 'integral-cms/admin';`;

function parse(code: string) {
  const ast = parseAst(code);
  return { ast, info: describeModule(ast) };
}

function scan(code: string) {
  const { ast, info } = parse(code);
  return scanModule("config.ts", ast, info);
}

it("finds calls under the aliased name and on a namespace import", () => {
  const found = scan(
    `import { clientRef as ref } from 'integral-cms/admin'; import * as admin from 'integral-cms/admin';
     ref('./a.ts'); admin.clientRef('./b.ts'); admin['clientRef']('./c.ts'); other('./d.ts');`,
  );

  expect([...found.refs.keys()]).toEqual(["./a.ts", "./b.ts"]);
});

it("ignores clientRef from another package", () => {
  expect(scan(`import { clientRef } from 'somewhere'; clientRef('./a.ts');`).refs.size).toBe(0);
});

it("marks calls under adminBar as site and others as not", () => {
  const found = scan(
    `${ADMIN} export default { fields: { a: clientRef('./a.ts') }, adminBar: { items: { b: clientRef('./b.ts') } } };`,
  );

  expect(found.refs).toEqual(
    new Map([
      ["./a.ts", false],
      ["./b.ts", true],
    ]),
  );
});

it("follows local declarations that adminBar uses, and survives a declaration that uses itself", () => {
  const found = scan(
    `${ADMIN}
     const items = { loop: () => items, b: clientRef('./b.ts') };
     const unused = clientRef('./unused.ts');
     export default { adminBar: { items } };`,
  );

  expect(found.refs.get("./b.ts")).toBe(true);
  expect(found.refs.get("./unused.ts")).toBe(false);
});

it("does not follow a declaration that only shares its name with a property key", () => {
  const found = scan(
    `${ADMIN}
     function plugin() {
       const mount = { page: clientRef('./page.ts') };
       return { pages: { mount }, adminBar: { items: { a: { mount: clientRef('./bar.ts'), x: mount.page } } } };
     }`,
  );

  expect(found.refs.get("./bar.ts")).toBe(true);
  expect(found.refs.get("./page.ts")).toBe(true);

  const keys = scan(
    `${ADMIN}
     function plugin() {
       const mount = { page: clientRef('./page.ts') };
       return { adminBar: { items: { a: { mount: clientRef('./bar.ts') } } } };
     }`,
  );

  expect(keys.refs.get("./page.ts")).toBe(false);
});

it("reports the imports that adminBar uses, once each", () => {
  const found = scan(
    `import { items, items as again } from './items.ts'; import * as ns from './ns.ts'; import def from './def.ts'; import './side.ts';
     export default { adminBar: { a: items, b: items, c: ns.one, d: ns['two'], e: def, f: ns[computed] }, outside: again };`,
  );

  expect(found.siteImports).toEqual([
    { source: "./items.ts", exported: "items" },
    { source: "./ns.ts", exported: "one" },
    { source: "./ns.ts", exported: "two" },
    { source: "./def.ts", exported: "default" },
  ]);
});

it("scans one export and reports the module it re-exports from", () => {
  const { info } = parse(
    `${ADMIN} import { other } from './other.ts';
     export const items = { a: clientRef('./a.ts'), b: other };
     export const unrelated = clientRef('./unrelated.ts');
     export { x as y } from './y.ts';
     export * from './star.ts';`,
  );
  const items = scanExport("refs.ts", info, "items");

  expect(items.refs).toEqual(new Map([["./a.ts", true]]));
  // `clientRef` is an import too. The crawl skips it, because `integral-cms/admin` is a leaf.
  expect(items.siteImports).toEqual([
    { source: "integral-cms/admin", exported: "clientRef" },
    { source: "./other.ts", exported: "other" },
    { source: "./star.ts", exported: "items" },
  ]);
  expect(scanExport("refs.ts", info, "y").siteImports).toEqual([
    { source: "./y.ts", exported: "x" },
    { source: "./star.ts", exported: "y" },
  ]);
});

it.each([
  `clientRef('./a' + '.ts')`,
  `clientRef(path)`,
  "clientRef(`./a.ts`)",
  `clientRef('./a.ts', 1)`,
  `clientRef()`,
])("rejects %s with the file name", (call) => {
  expect(() => scan(`${ADMIN} ${call};`)).toThrow(
    'config.ts MUST use one literal string, e.g. clientRef("./src/admin/color.ts#mountColor")',
  );
});

it("scans modules with holes in destructuring patterns", () => {
  const found = scan(
    `${ADMIN} const [, value] = values; export default { field: clientRef('./field.ts') };`,
  );

  expect([...found.refs.keys()]).toEqual(["./field.ts"]);
});
