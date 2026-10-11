import { eachChild, nameOf, type ModuleInfo } from "./module-syntax.ts";
import type { AstNode, Binding, Program } from "./types.ts";

/** What a scan of one module found. */
export type Found = {
  /** `clientRef()` specifier → whether the call is reachable from `adminBar`. */
  refs: Map<string, boolean>;
  /** Imports that `adminBar` uses. Their exports MUST be scanned too. */
  siteImports: Binding[];
};

type Scan = {
  file: string;
  info: ModuleInfo;
  refs: Map<string, boolean>;
  siteImports: Map<string, Binding>;
  /** Declarations being followed. Stops recursion on a declaration that uses itself. */
  following: Set<string>;
};

/**
 * Scans a whole module for `clientRef()` calls. Everything below an `adminBar` property counts as site.
 * @throws {Error} For a `clientRef()` call that is not one literal string.
 */
export function scanModule(file: string, ast: Program, info: ModuleInfo): Found {
  const scan = startScan(file, info);
  walk(scan, ast, false);
  return finish(scan);
}

/**
 * Scans one export of a module that `adminBar` imports. Everything the export uses counts as site.
 * @throws {Error} For a `clientRef()` call that is not one literal string.
 */
export function scanExport(file: string, info: ModuleInfo, exportName: string): Found {
  const scan = startScan(file, info);
  walk(scan, info.exports.get(exportName), true);

  // The export may live in another module.
  const reexport = info.reexports.get(exportName);
  if (reexport) addSiteImport(scan, reexport);
  for (const source of info.stars) addSiteImport(scan, { source, exported: exportName });
  return finish(scan);
}

function startScan(file: string, info: ModuleInfo): Scan {
  return { file, info, refs: new Map(), siteImports: new Map(), following: new Set() };
}

function finish(scan: Scan): Found {
  return { refs: scan.refs, siteImports: [...scan.siteImports.values()] };
}

function addSiteImport(scan: Scan, binding: Binding) {
  scan.siteImports.set(`${binding.source}#${binding.exported}`, binding);
}

function walk(scan: Scan, node: AstNode, site: boolean) {
  if (!node || typeof node !== "object") return;
  if (node.type === "Property" && nameOf(node.key) === "adminBar") site = true;

  if (site) {
    const binding = importedBy(scan.info, node);
    if (binding) addSiteImport(scan, binding);
    followDeclaration(scan, node);
  }
  if (isClientRefCall(scan.info, node)) record(scan, node, site);

  eachChild(node, (child) => {
    if (!isName(node, child)) walk(scan, child, site);
  });
}

// A property key or member name is a label, not a reference to a declaration.
function isName(parent: AstNode, child: AstNode) {
  return (
    child.type === "Identifier" &&
    !parent.computed &&
    ((parent.type === "Property" && parent.key === child && parent.value !== child) ||
      (parent.type === "MemberExpression" && parent.property === child))
  );
}

// An identifier that names an import, or `ns.name` / `ns["name"]` on a namespace import.
function importedBy(info: ModuleInfo, node: AstNode): Binding | undefined {
  if (node.type === "Identifier") {
    const binding = info.bindings.get(node.name);
    return binding && binding.exported !== "*" ? binding : undefined;
  }
  if (node.type === "MemberExpression" && node.object.type === "Identifier") {
    const binding = info.bindings.get(node.object.name);
    const named = !node.computed || node.property.type === "Literal";
    if (binding?.exported === "*" && named)
      return { source: binding.source, exported: String(nameOf(node.property)) };
  }
}

// An identifier that names a declaration of this module: its code is part of the site too.
function followDeclaration(scan: Scan, node: AstNode) {
  const { declarations } = scan.info;
  if (node.type !== "Identifier" || !declarations.has(node.name) || scan.following.has(node.name))
    return;
  scan.following.add(node.name);
  walk(scan, declarations.get(node.name), true);
  scan.following.delete(node.name);
}

// `clientRef(...)` or `ns.clientRef(...)`, with the names that `integral-cms/admin` was imported under.
function isClientRefCall(info: ModuleInfo, node: AstNode) {
  if (node.type !== "CallExpression") return false;
  const { callee } = node;
  if (callee?.type === "Identifier") return info.clientRefNames.has(callee.name);
  return (
    callee?.type === "MemberExpression" &&
    info.adminNamespaces.has(callee.object?.name) &&
    callee.property?.name === "clientRef" &&
    !callee.computed
  );
}

function record(scan: Scan, call: AstNode, site: boolean) {
  const [arg] = call.arguments;
  if (call.arguments.length !== 1 || arg?.type !== "Literal" || typeof arg.value !== "string")
    throw new Error(
      `integral-cms: clientRef() in ${scan.file} MUST use one literal string, e.g. clientRef("./src/admin/color.ts#mountColor"). The adapter reads the call from source and cannot evaluate computed values`,
    );
  scan.refs.set(arg.value, site || scan.refs.get(arg.value) === true);
}
