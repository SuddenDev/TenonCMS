import { readFile } from "node:fs/promises";
import { parseAst, transformWithOxc } from "vite";
import type { AstNode, Binding, Program } from "./types.ts";

const SCRIPT = /\.[cm]?[jt]sx?$/;
const ADMIN_ENTRY = "integral-cms/admin";

/** What one module declares, imports and exports. */
export type ModuleInfo = {
  /** Local name → the import it stands for. */
  bindings: Map<string, Binding>;
  /** Local names of `clientRef` imported from `integral-cms/admin`. */
  clientRefNames: Set<string>;
  /** Local names of `import * as x from "integral-cms/admin"`. */
  adminNamespaces: Set<string>;
  /** Source of every static import and re-export, in module order. */
  sources: string[];
  /** Exported name → the declaration or expression it exports. */
  exports: Map<string, AstNode>;
  /** Exported name → the module and name it re-exports. */
  reexports: Map<string, Binding>;
  /** Sources of `export * from`. */
  stars: string[];
  /** Variable and function declarations at any depth. A later declaration of a name replaces an earlier one. */
  declarations: Map<string, AstNode>;
};

/** Whether `file` is JavaScript or TypeScript source. */
export function isScript(file: string) {
  return SCRIPT.test(file);
}

/** The name of an identifier or string literal node. */
export function nameOf(node: AstNode): string {
  return node?.name ?? node?.value;
}

/** Calls `visit` for every child node and every node in a child list. */
export function eachChild(node: AstNode, visit: (child: AstNode) => void) {
  for (const value of Object.values(node))
    if (Array.isArray(value)) value.forEach((child) => visit(child));
    else if (value && typeof value === "object") visit(value);
}

/**
 * Parses a script or the `<script>` blocks of a Vue file. TypeScript and JSX are transformed first.
 * @returns The program. Other files are parsed as plain JavaScript.
 */
export async function parseModule(file: string): Promise<Program> {
  const raw = await readFile(file, "utf8");
  const vue = file.endsWith(".vue");
  const source = vue
    ? [...raw.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map((match) => match[1]).join("\n")
    : raw;
  const code =
    isScript(file) || vue
      ? (await transformWithOxc(source, vue ? file + ".ts" : file)).code
      : source;
  return parseAst(code);
}

/** Reads the imports, exports and declarations of a parsed module. */
export function describeModule(ast: Program): ModuleInfo {
  const info: ModuleInfo = {
    bindings: new Map(),
    clientRefNames: new Set(),
    adminNamespaces: new Set(),
    sources: [],
    exports: new Map(),
    reexports: new Map(),
    stars: [],
    declarations: new Map(),
  };
  for (const node of ast.body) {
    if (node.type === "ImportDeclaration") readImport(info, node);
    if ("source" in node && node.source && typeof node.source.value === "string")
      info.sources.push(node.source.value);
    readExport(info, node);
  }
  readDeclarations(info.declarations, ast);
  return info;
}

function readImport(info: ModuleInfo, node: AstNode) {
  const source = String(node.source.value);
  for (const specifier of node.specifiers) {
    info.bindings.set(specifier.local.name, {
      source,
      exported:
        specifier.type === "ImportSpecifier"
          ? nameOf(specifier.imported)
          : specifier.type === "ImportDefaultSpecifier"
            ? "default"
            : "*",
    });
    if (source !== ADMIN_ENTRY) continue;
    if (specifier.type === "ImportSpecifier" && nameOf(specifier.imported) === "clientRef")
      info.clientRefNames.add(specifier.local.name);
    if (specifier.type === "ImportNamespaceSpecifier")
      info.adminNamespaces.add(specifier.local.name);
  }
}

function readExport(info: ModuleInfo, node: AstNode) {
  if (node.type === "ExportDefaultDeclaration") info.exports.set("default", node.declaration);
  if (node.type === "ExportAllDeclaration") info.stars.push(String(node.source.value));
  if (node.type !== "ExportNamedDeclaration") return;

  const { declaration } = node;
  if (declaration?.type === "VariableDeclaration") {
    for (const declarator of declaration.declarations)
      if (declarator.id.type === "Identifier")
        info.exports.set(declarator.id.name, declarator.init);
  } else if (declaration && "id" in declaration && declaration.id) {
    info.exports.set(nameOf(declaration.id), declaration);
  }

  for (const specifier of node.specifiers) {
    if (node.source)
      info.reexports.set(nameOf(specifier.exported), {
        source: String(node.source.value),
        exported: nameOf(specifier.local),
      });
    else info.exports.set(nameOf(specifier.exported), specifier.local);
  }
}

function readDeclarations(declarations: Map<string, AstNode>, node: AstNode) {
  if (!node || typeof node !== "object") return;
  if (node.type === "VariableDeclarator" && node.id.type === "Identifier")
    declarations.set(node.id.name, node.init);
  if (node.type === "FunctionDeclaration" && node.id) declarations.set(node.id.name, node);
  eachChild(node, (child) => readDeclarations(declarations, child));
}
