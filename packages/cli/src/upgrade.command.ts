import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import * as p from "@clack/prompts";
import { Cancelled, answer, canAsk } from "./ui.ts";

export type PackageManager = "npm" | "pnpm" | "yarn" | "bun";
export type UpgradeFlags = { "dry-run"?: boolean; yes?: boolean };

const LOCKFILES: [string, PackageManager][] = [
  ["pnpm-lock.yaml", "pnpm"],
  ["yarn.lock", "yarn"],
  ["bun.lock", "bun"],
  ["bun.lockb", "bun"],
  ["package-lock.json", "npm"],
];

// Released together, with the same version.
const PACKAGES = ["tenoncms", "@tenoncms/cli"];

type Update = { name: string; installed: string; latest: string; dev: boolean };

/**
 * `tenon upgrade`: compares the installed `tenoncms` and `@tenoncms/cli` with the latest on npm and installs the newer
 * ones after a confirm. Only packages in the project's `package.json` are upgraded.
 */
export async function upgradeCommand(flags: UpgradeFlags) {
  const cwd = process.cwd();
  const pkg = await readJson(join(cwd, "package.json"));
  if (!pkg) throw new Error("No package.json here. Run tenon upgrade in your project.");

  const updates: Update[] = [];
  for (const name of PACKAGES) {
    const dev = !pkg.dependencies?.[name] && !!pkg.devDependencies?.[name];
    if (!pkg.dependencies?.[name] && !dev) continue;
    const installed = (await readJson(join(cwd, "node_modules", name, "package.json")))?.version;
    const latest = await latestVersion(name);
    if (installed && compareVersions(installed, latest) >= 0) continue;
    updates.push({ name, installed: installed ?? "not installed", latest, dev });
  }
  if (!updates.length) {
    p.log.success("Up to date.");
    return;
  }
  for (const u of updates) p.log.info(`${u.name} ${u.installed} → ${u.latest}`);
  p.log.info("Release notes: https://github.com/SuddenDev/TenonCMS/releases");
  if (updates.some((u) => u.installed !== "not installed" && mayBreak(u.installed, u.latest)))
    p.log.warn("This update MAY break your project. Read the release notes first.");

  const pm = detectPackageManager(cwd);
  const commands = [false, true]
    .map((dev) => updates.filter((u) => u.dev === dev).map((u) => `${u.name}@${u.latest}`))
    .map((specs, i) => (specs.length ? addCommand(pm, specs, i === 1) : undefined))
    .filter((c) => !!c);
  const shown = commands.map(([command, args]) => `${command} ${args.join(" ")}`).join(" && ");
  if (flags["dry-run"]) {
    p.log.info(`Dry run: would run ${shown}`);
    return;
  }
  if (!flags.yes) {
    if (!canAsk(flags)) throw new Error("Pass --yes to upgrade without a question.");
    if (!(await answer(p.confirm({ message: `Run ${shown}?` }))))
      throw new Cancelled("Nothing was changed.");
  }
  for (const [command, args] of commands) {
    const run = spawnSync(command, args, { stdio: "inherit", shell: process.platform === "win32" });
    if (run.status !== 0) throw new Error(`${command} failed with exit code ${run.status}`);
  }
  p.log.success(`Upgraded ${updates.map((u) => `${u.name} to ${u.latest}`).join(", ")}`);
}

async function readJson(file: string) {
  return readFile(file, "utf8").then(
    (text) =>
      JSON.parse(text) as {
        version?: string;
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      },
    () => undefined,
  );
}

async function latestVersion(name: string) {
  const res = await fetch(`https://registry.npmjs.org/${name.replace("/", "%2F")}/latest`);
  if (!res.ok) throw new Error(`The npm registry answered ${res.status} for ${name}`);
  return ((await res.json()) as { version: string }).version;
}

/** Sorts `a` before `b` by major, minor and patch. A prerelease sorts before its release. */
export function compareVersions(a: string, b: string) {
  const parse = (v: string) => {
    const [core = "", pre] = v.split("-", 2);
    return { parts: core.split(".").map(Number), pre };
  };
  const x = parse(a);
  const y = parse(b);
  for (let i = 0; i < 3; i++) {
    const d = (x.parts[i] ?? 0) - (y.parts[i] ?? 0);
    if (d) return d;
  }
  if (x.pre === y.pre) return 0;
  if (!x.pre) return 1;
  if (!y.pre) return -1;
  return x.pre.localeCompare(y.pre, undefined, { numeric: true });
}

/** Whether semver allows breaking changes from `from` to `to`: a new major, or a new minor below 1.0. */
export function mayBreak(from: string, to: string) {
  const [fa, fb] = from.split(".").map(Number);
  const [ta, tb] = to.split(".").map(Number);
  return fa !== ta || (fa === 0 && fb !== tb);
}

/** The lockfile in `cwd` decides, else the package manager that runs the CLI, else npm. */
export function detectPackageManager(
  cwd: string,
  userAgent = process.env.npm_config_user_agent ?? "",
): PackageManager {
  const lock = LOCKFILES.find(([file]) => existsSync(join(cwd, file)));
  if (lock) return lock[1];
  const name = userAgent.split("/")[0];
  return (["pnpm", "yarn", "bun"] as const).find((pm) => pm === name) ?? "npm";
}

/** The command that adds `specs` to the project's dependencies, or with `dev` to its dev dependencies. */
export function addCommand(pm: PackageManager, specs: string[], dev = false): [string, string[]] {
  return [pm, [pm === "npm" ? "install" : "add", ...(dev ? ["--dev"] : []), ...specs]];
}
