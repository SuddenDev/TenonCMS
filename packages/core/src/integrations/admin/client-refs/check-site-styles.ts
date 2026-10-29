import { readFile } from "node:fs/promises";
import { describeModule, isScript, parseModule } from "./module-syntax.ts";
import { resolveImport } from "./resolve-import.ts";
import type { Resolver } from "./types.ts";

const STYLE = /\.(css|less|sass|scss|styl|stylus|pcss|postcss|sss)(?:\?|$)/;
const INLINE_STYLE = /[?&](inline|raw)(?:&|$)/;

/**
 * Rejects styles that the module graph of the `entries` would inject into the host page. CSS imported with
 * `?inline` or `?raw` is fine: the admin bar mounts it inside its shadow root.
 * @throws {Error} For eager CSS and for a Vue component with a `<style>` block.
 */
export async function checkSiteStyles(entries: string[], resolver: Resolver) {
  const seen = new Set<string>();
  for (const entry of entries) await visit(entry, resolver, seen);
}

async function visit(file: string, resolver: Resolver, seen: Set<string>) {
  if (seen.has(file)) return;
  seen.add(file);

  if (STYLE.test(file)) {
    if (!INLINE_STYLE.test(file))
      throw new Error(
        `tenoncms: eager CSS in site admin graph: ${file}. Use clientRef() for styled fields/pages, or ?inline for CSS mounted inside the bar's shadow root.`,
      );
    return;
  }

  const vue = file.endsWith(".vue");
  if (vue && /<style(?:\s|>)/.test(await readFile(file, "utf8")))
    throw new Error(
      `tenoncms: styled Vue component in site admin graph: ${file}. Load it through clientRef().`,
    );
  if (!isScript(file) && !vue) return;

  const { sources } = describeModule(await parseModule(file));
  for (const source of sources) {
    const target = await resolveImport(resolver, source, file);
    if (target) await visit(target, resolver, seen);
  }
}
