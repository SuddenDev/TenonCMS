import { stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { adminPath } from "../../admin/path.ts";
import {
  describeModule,
  nameOf,
  parseModule,
  type ModuleInfo,
} from "./client-refs/module-syntax.ts";
import { resolveImport } from "./client-refs/resolve-import.ts";
import type { AstNode, Resolver } from "./client-refs/types.ts";

/** The admin path of the configuration. */
export type AdminPathResult = {
  /** The normalized path, or `false` for `admin: false`. */
  path: string | false;
  /** `process.env.NAME` → the path as a JS literal, when the path comes from an env var. Empty otherwise. */
  define: Record<string, string>;
};

type Value = { file: string; info: ModuleInfo; node: AstNode };

const SHAPE_ERROR = "tenoncms: admin.path in tenon.config.ts must be a string or process.env.NAME";
const EXTENSIONS = ["", ".ts", ".mts", ".js", ".mjs", "/index.ts", "/index.js"];

/**
 * Reads `admin.path` from the source of the configuration, without running it. The default export MUST be
 * `defineCms({ ... })`. `admin` may be inline or a name bound to an object literal, also an imported one.
 * @param env Values for `process.env.NAME`, e.g. from Vite's `loadEnv()`.
 * @throws {Error} For any other shape of `admin` or `admin.path`, and for a path that `adminPath()` rejects.
 */
export async function readAdminPath(
  configFile: string,
  resolver: Resolver,
  env: Record<string, string | undefined>,
): Promise<AdminPathResult> {
  const root = await exportedValue(configFile, "default", resolver);
  const options = root && (await unwrapCalls(root, resolver));
  if (options?.node?.type !== "ObjectExpression")
    throw new Error(
      `tenoncms: ${configFile} MUST export default defineCms({ ... }), so the adapter can read admin.path`,
    );

  const admin = await propertyValue(options, "admin", resolver);
  if (!admin) return { path: "/admin", define: {} };
  if (admin.node.type === "Literal" && admin.node.value === false)
    return { path: false, define: {} };
  if (admin.node.type !== "ObjectExpression") throw new Error(SHAPE_ERROR);

  const path = await propertyValue(admin, "path", resolver);
  if (!path) return { path: "/admin", define: {} };
  return readPath(path.node, env);
}

/** Resolves relative and absolute imports to files, with or without their extension. */
export const configResolver: Resolver = async (id, importer) => {
  if (!id.startsWith(".") && !id.startsWith("/")) return null;
  const base = resolve(dirname(importer), id);
  for (const candidate of [...EXTENSIONS.map((ext) => base + ext), base.replace(/\.js$/, ".ts")])
    if (await isFile(candidate)) return candidate;
  return null;
};

function readPath(node: AstNode, env: Record<string, string | undefined>): AdminPathResult {
  if (node.type === "Literal" && typeof node.value === "string")
    return { path: adminPath(node.value as `/${string}`)!, define: {} };

  const fallback = node.type === "LogicalExpression" && node.operator === "??" ? node.right : null;
  if (fallback && (fallback.type !== "Literal" || typeof fallback.value !== "string"))
    throw new Error(SHAPE_ERROR);

  const name = envName(fallback ? node.left : node);
  if (!name) throw new Error(SHAPE_ERROR);
  const path = adminPath((env[name] ?? fallback?.value ?? "/admin") as `/${string}`)!;
  return { path, define: { [`process.env.${name}`]: JSON.stringify(path) } };
}

// `process.env.NAME`, or `undefined` for anything else.
function envName(node: AstNode): string | undefined {
  if (node.type !== "MemberExpression" || node.computed) return;
  const { object } = node;
  if (
    object.type === "MemberExpression" &&
    !object.computed &&
    nameOf(object.object) === "process" &&
    nameOf(object.property) === "env"
  )
    return nameOf(node.property);
}

// `defineCms({ ... })` and wrappers around it: the first argument, through names bound to it.
async function unwrapCalls(value: Value, resolver: Resolver): Promise<Value | undefined> {
  let current: Value | undefined = value;
  while (current?.node?.type === "CallExpression")
    current = await followName({ ...current, node: current.node.arguments[0] }, resolver);
  return current;
}

/**
 * The value of `key` in an object literal, through names bound to it.
 * @returns `undefined` when the object has no such key.
 * @throws {Error} When a spread after the last `key` may replace it, and for a call or a name it cannot follow.
 */
async function propertyValue(object: Value, key: string, resolver: Resolver) {
  let property: AstNode;
  let hidden = false;
  for (const candidate of object.node.properties) {
    if (candidate.type === "SpreadElement") hidden = true;
    else if (!candidate.computed && nameOf(candidate.key) === key) {
      property = candidate;
      hidden = false;
    }
  }
  if (hidden || (property && property.kind !== "init")) throw new Error(SHAPE_ERROR);
  if (!property) return;

  const value = await followName({ ...object, node: property.value }, resolver);
  if (!value || value.node.type === "CallExpression") throw new Error(SHAPE_ERROR);
  return value;
}

// A name declared in the module or imported from another one, followed to the expression it stands for.
async function followName(value: Value, resolver: Resolver): Promise<Value | undefined> {
  const { file, info, node } = value;
  if (node?.type !== "Identifier") return value;

  const declaration = info.declarations.get(node.name);
  if (declaration) return followName({ file, info, node: declaration }, resolver);

  const binding = info.bindings.get(node.name);
  if (!binding || binding.exported === "*") return;
  const target = await resolveImport(resolver, binding.source, file);
  return target ? exportedValue(target, binding.exported, resolver) : undefined;
}

async function exportedValue(
  file: string,
  name: string,
  resolver: Resolver,
): Promise<Value | undefined> {
  const info = describeModule(await parseModule(file));

  const node = info.exports.get(name);
  if (node) return followName({ file, info, node }, resolver);

  const reexport = info.reexports.get(name);
  const sources = reexport ? [reexport.source] : info.stars;
  for (const source of sources) {
    const target = await resolveImport(resolver, source, file);
    const found = target && (await exportedValue(target, reexport?.exported ?? name, resolver));
    if (found) return found;
  }
}

async function isFile(path: string) {
  return (await stat(path).catch(() => null))?.isFile() ?? false;
}
