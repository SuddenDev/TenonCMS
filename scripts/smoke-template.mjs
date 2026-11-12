// Scaffolds one framework and target from ./templates against the packed tarballs, then installs and builds it.
// Run `pnpm tarball` first. Usage: node scripts/smoke-template.mjs <framework> <target> [database] [storage] [template]
// An omitted database or storage is the target's default.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const [framework, target, database, storage, template = "minimal"] = process.argv.slice(2);
if (!framework || !target)
  throw new Error(
    "Usage: node scripts/smoke-template.mjs <framework> <target> [database] [storage] [template]",
  );

const root = resolve(import.meta.dirname, "..");
const { version } = JSON.parse(readFileSync(join(root, "packages/core/package.json"), "utf8"));
const tarballs = {
  tenoncms: join(root, `dist/tenoncms-${version}.tgz`),
  "@tenoncms/cli": join(root, `dist/tenoncms-cli-${version}.tgz`),
};
// Outside the repository, so pnpm does not treat it as a workspace package.
const name = [framework, template, target, database, storage].filter(Boolean).join("-");
const dir = join(mkdtempSync(join(tmpdir(), "tenon-smoke-")), name);
const run = (command, args, cwd = dir) => {
  console.log(`$ ${command} ${args.join(" ")}`);
  execFileSync(command, args, { cwd, stdio: "inherit" });
};

run(
  "node",
  [
    join(root, "packages/create-tenoncms/dist/index.mjs"),
    dir,
    "--framework",
    framework,
    "--template",
    template,
    "--target",
    target,
    ...(database ? ["--database", database] : []),
    ...(storage ? ["--storage", storage] : []),
    "--pm",
    "pnpm",
    "--no-install",
    "--no-git",
    "--yes",
    "--templates",
    join(root, "templates"),
  ],
  root,
);

const file = join(dir, "package.json");
const pkg = JSON.parse(readFileSync(file, "utf8"));
for (const deps of [pkg.dependencies, pkg.devDependencies])
  for (const [name, tarball] of Object.entries(tarballs))
    if (deps?.[name]) deps[name] = `file:${tarball}`;
writeFileSync(file, JSON.stringify(pkg, null, 2));

run("pnpm", ["install"]);
run("pnpm", ["run", "build"]);
// Local mode loads the config like the dev server. CI has no Postgres server and no bucket keys, and Cloudflare's config
// runs only in workerd.
if (target === "node" && database !== "postgres" && storage !== "s3")
  run("pnpm", ["exec", "tenon", "backup", "--dry-run", "--yes"]);
console.log(`ok: ${name} in ${dir}`);
