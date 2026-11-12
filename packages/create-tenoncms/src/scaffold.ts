import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { appendFile, cp, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { envExample, fillMarkers, SECRET_PART, type Part } from "./stack.ts";

type Option = { label: string; hint?: string };
/** `templates/index.json`: what the prompts offer. */
export type TemplateIndex = {
  /** `envModule`: where the config imports its environment variables from. Without it, it reads `process.env`. */
  frameworks: Record<string, Option & { targets: string[]; envModule?: string }>;
  templates: Record<string, Option & { frameworks: string[] }>;
  /** `envFile`: the file for local secrets. Default: `.env`. */
  targets: Record<string, Option & { databases: string[]; storages: string[]; envFile?: string }>;
  databases: Record<string, Option>;
  storages: Record<string, Option>;
};

export type Choices = {
  name: string;
  framework: string;
  template: string;
  target: string;
  database: string;
  storage: string;
  /** The version `latest` of `tenoncms` and `@tenoncms/cli` becomes, without a range. `undefined` keeps `latest`. */
  tenonVersion?: string;
};

type PackageJson = Record<string, unknown> & {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

const SECRET = /^((?:NUXT_)?CMS_SECRET)=.*$/m;

/**
 * The templates folder: `source` itself when it is a local folder, else a giget download of it into a temporary
 * folder.
 */
export async function fetchTemplates(source: string) {
  if (existsSync(source)) return resolve(source);
  const { downloadTemplate } = await import("giget");
  const { dir } = await downloadTemplate(source, {
    dir: await mkdtemp(join(tmpdir(), "create-tenoncms-")),
    force: true,
  });
  return dir;
}

export async function readIndex(root: string): Promise<TemplateIndex> {
  return JSON.parse(await readFile(join(root, "index.json"), "utf8"));
}

/**
 * Copies the layers into `dir`: the template, the shared target, the framework's target, then the database and the
 * storage. A target MAY have its own version of a database or storage in `_databases/` or `_storages/`. Later files
 * overwrite earlier ones; `package.json` files are merged instead. Then fills the markers of the copied files with each
 * layer's `part.json`, names the package, pins `tenoncms` and `@tenoncms/cli`, and writes the env file with a new
 * `CMS_SECRET`.
 */
export async function scaffold(root: string, dir: string, choices: Choices) {
  const index = await readIndex(root);
  const target = join(root, "_targets", choices.target);
  const part = (kind: string, id: string) =>
    [join(target, kind, id), join(root, kind, id)].find((layer) => existsSync(layer));
  const template = join(root, choices.framework, choices.template);
  if (!existsSync(template))
    throw new Error(`No template ${choices.framework}/${choices.template}`);
  const layers = [
    template,
    target,
    join(root, choices.framework, "_targets", choices.target),
    part("_databases", choices.database),
    part("_storages", choices.storage),
  ].filter((layer): layer is string => !!layer && existsSync(layer));

  let pkg: PackageJson = {};
  const parts: Part[] = [SECRET_PART];
  for (const layer of layers) {
    const read = async (file: string) => JSON.parse(await readFile(join(layer, file), "utf8"));
    if (existsSync(join(layer, "package.json")))
      pkg = mergePackageJson(pkg, await read("package.json"));
    if (existsSync(join(layer, "part.json"))) parts.push(await read("part.json"));
    const skip = ["package.json", "part.json", "_databases", "_storages"].map((name) =>
      join(layer, name),
    );
    await cp(layer, dir, { recursive: true, force: true, filter: (src) => !skip.includes(src) });
  }

  const envModule = index.frameworks[choices.framework]?.envModule;
  for (const file of new Set(parts.flatMap((p) => Object.keys(p.files ?? {})))) {
    const path = join(dir, file);
    if (!existsSync(path)) throw new Error(`A part writes to ${file}, but the template has none`);
    await writeFile(path, fillMarkers(await readFile(path, "utf8"), file, parts, envModule));
  }
  const ignore = parts.flatMap((p) => p.ignore ?? []);
  if (ignore.length) await appendFile(join(dir, ".gitignore"), `${ignore.join("\n")}\n`);
  const envFile = index.targets[choices.target]?.envFile ?? ".env";
  await writeFile(join(dir, `${envFile}.example`), envExample(parts));

  pkg.name = choices.name;
  // `tenoncms` and `@tenoncms/cli` are released together, with the same version.
  for (const deps of [pkg.dependencies, pkg.devDependencies])
    for (const name of ["tenoncms", "@tenoncms/cli"])
      if (deps?.[name] === "latest" && choices.tenonVersion)
        deps[name] = `^${choices.tenonVersion}`;
  await writeFile(join(dir, "package.json"), `${JSON.stringify(pkg, null, 2)}\n`);
  await writeEnvFiles(dir);
}

/** `b` over `a`. `scripts` and both dependency lists merge key by key; dependencies stay sorted. */
export function mergePackageJson(a: PackageJson, b: PackageJson): PackageJson {
  const merged: PackageJson = { ...a, ...b };
  if (a.scripts || b.scripts) merged.scripts = { ...a.scripts, ...b.scripts };
  for (const key of ["dependencies", "devDependencies"] as const)
    if (a[key] || b[key])
      merged[key] = Object.fromEntries(
        Object.entries({ ...a[key], ...b[key] }).sort(([x], [y]) => x.localeCompare(y)),
      );
  return merged;
}

/** A valid npm package name from a folder name. */
export function toPackageName(name: string) {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-~._]+/g, "-")
      .replace(/^[-._]+|-+$/g, "") || "tenon-site"
  );
}

async function writeEnvFiles(dir: string) {
  for (const file of await readdir(dir)) {
    const match = /^(\..+)\.example$/.exec(file);
    if (!match || existsSync(join(dir, match[1]!))) continue;
    const text = await readFile(join(dir, file), "utf8");
    const secret = randomBytes(32).toString("hex");
    await writeFile(join(dir, match[1]!), text.replace(SECRET, `$1=${secret}`), { mode: 0o600 });
  }
}
