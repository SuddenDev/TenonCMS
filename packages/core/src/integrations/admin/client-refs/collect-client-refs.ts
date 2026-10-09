import { resolve } from "node:path";
import { describeModule, isScript, parseModule } from "./module-syntax.ts";
import { resolveImport } from "./resolve-import.ts";
import { scanExport, scanModule } from "./scan-refs.ts";
import type { ClientRef, Program, Resolver } from "./types.ts";

type Crawl = {
  resolver: Resolver;
  onVisit?: (file: string) => void;
  refs: Record<string, ClientRef>;
  /** `file#export` of every scan that ran. An empty export is the scan of the whole file. */
  seen: Set<string>;
  /** A module is parsed once, however many scans it gets. */
  programs: Map<string, Promise<Program>>;
};

/**
 * Discovers literal `clientRef()` calls through the static ESM imports of the server configuration, without
 * evaluating it.
 * @param root Project root. Specifiers resolve from its `integral.config.ts`.
 * @param entries Files to start from, usually the configuration.
 * @param onVisit Called with every source file that was read, e.g. to watch it.
 * @returns The references by their `clientRef()` specifier, e.g. `./src/admin/color.ts#mountColor`.
 * @throws {Error} For a `clientRef()` that is not one literal string, and for a specifier that does not resolve.
 */
export async function collectClientRefs(
  root: string,
  entries: string[],
  resolver: Resolver,
  onVisit?: (file: string) => void,
) {
  const crawl: Crawl = {
    resolver,
    onVisit,
    refs: Object.create(null),
    seen: new Set(),
    programs: new Map(),
  };

  for (const entry of entries) await visit(crawl, entry);
  await resolveFiles(crawl.refs, root, resolver);
  return crawl.refs;
}

// A scan of the whole file follows every import. A scan of one export follows only what that export uses.
async function visit(crawl: Crawl, file: string, siteExport?: string) {
  const key = `${file}#${siteExport ?? ""}`;
  if (crawl.seen.has(key) || !isScript(file)) return;
  crawl.seen.add(key);
  crawl.onVisit?.(file);

  const ast = await parse(crawl, file);
  const info = describeModule(ast);
  const found =
    siteExport === undefined ? scanModule(file, ast, info) : scanExport(file, info, siteExport);

  for (const [specifier, site] of found.refs) {
    const known = crawl.refs[specifier];
    crawl.refs[specifier] = {
      file: "",
      export: "",
      ...(site || known?.site ? { site: true } : {}),
    };
  }

  if (siteExport === undefined)
    for (const source of info.sources) await follow(crawl, file, source);
  for (const { source, exported } of found.siteImports) await follow(crawl, file, source, exported);
}

async function follow(crawl: Crawl, importer: string, source: string, siteExport?: string) {
  const target = await resolveImport(crawl.resolver, source, importer);
  if (target) await visit(crawl, target, siteExport);
}

function parse(crawl: Crawl, file: string) {
  if (!crawl.programs.has(file)) crawl.programs.set(file, parseModule(file));
  return crawl.programs.get(file)!;
}

// Fills `file` and `export` of every reference found. `id#name` loads `name`, the default export without it.
async function resolveFiles(refs: Record<string, ClientRef>, root: string, resolver: Resolver) {
  for (const specifier of Object.keys(refs)) {
    const [id, exported = "default"] = specifier.split("#");
    const file = await resolver(id, resolve(root, "integral.config.ts"));
    if (!file)
      throw new Error(`integral-cms: cannot resolve clientRef("${specifier}") from ${root}`);
    refs[specifier] = { ...refs[specifier], file, export: exported };
  }
}
