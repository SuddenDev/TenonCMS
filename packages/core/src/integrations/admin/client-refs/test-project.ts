import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { Resolver } from "./types.ts";

const roots: string[] = [];

/** Creates a temporary project with the given files, `path` relative to its root. Call `removeProjects()` after. */
export async function tempProject(files: Record<string, string>) {
  const root = await mkdtemp(join(tmpdir(), "integral-refs-"));
  roots.push(root);
  for (const [path, code] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), code);
  }
  return root;
}

/** Removes every project that `tempProject()` made. */
export async function removeProjects() {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
}

/** Resolves relative imports from the importer's folder and nothing else. */
export const relativeResolver: Resolver = async (id, importer) =>
  id.startsWith(".") ? join(importer.slice(0, importer.lastIndexOf("/")), id) : null;
