import type { Caller, Core, Inner } from "../cms/runtime/types.ts";
import { inner, outerScope } from "../cms/runtime/operation-context.ts";
import { collectionTarget, globalTarget } from "../content/targets.ts";
import { hookArgs } from "../content/lifecycle/hook-args.ts";
import type { Fields } from "../schema/index.ts";
import { blocksOf } from "../schema/traversal/blocks-of.ts";
import { visibleTasks } from "../jobs/operations/job-access.ts";
import { visibleActions } from "../admin/actions/run-action.ts";
import { fieldAllowed } from "./field-access.ts";
import { type Op, decide } from "./rule.ts";
import type { FieldAccess } from "./types.ts";

type Json = Record<string, any>;

/**
 * Adds what the caller MAY do to a copy of the `/schema` JSON, for the admin and API keys: `access` with every
 * operation on each collection and global (`true`, `false`, or a `where` the admin matches a document against), and
 * `access` with the denied operations (`false`) on each field. Rules run without a document, `id` or `data`, and
 * `read` in the caller's `perspective`; the server stays the authority. `jobs` lists the tasks the caller MAY see, `admin.actions` only the actions they MAY run. A shared block is sent once, so its rules run
 * without a collection or global, with paths from the block.
 * @returns The copy.
 */
export async function withPermissions(core: Core, json: Json, visitor: Caller) {
  const out = structuredClone(json);
  const s = inner(core, outerScope(visitor), undefined, {});
  const draft = visitor.perspective === "drafts";

  const entries = [
    ...Object.entries(core.schema.collections).map(([n, e]) => [collectionTarget(n), e] as const),
    ...Object.entries(core.schema.globals).map(([n, e]) => [globalTarget(n), e] as const),
  ];
  for (const [name, entry] of entries) {
    const target = out[`${name.kind}s`][name.name];
    const ops: Op[] =
      name.kind === "collection" ? ["read", "create", "update", "delete"] : ["read", "update"];

    target.access = {};
    for (const op of ops)
      target.access[op] = await decide(core, s, name, op, op === "read" ? { draft } : {});
    await fieldPermissions(s, entry.fields, target.fields, hookArgs(s, name, {}), "");
  }

  out.jobs = await visibleTasks(core, s);
  out.admin.actions = await visibleActions(core, s);

  const shared = {
    cms: s.cms,
    user: s.user,
    apiKey: s.apiKey,
    context: s.context,
    draft: false,
    locale: s.locale,
  };
  for (const [name, block] of Object.entries(core.schema.blocks))
    await fieldPermissions(s, block.fields, out.blocks[name].fields, shared, "");
  return out;
}

/** Writes `access` with the denied operations into the JSON of each field, recursing into groups and items. */
async function fieldPermissions(
  s: Inner,
  fields: Fields,
  target: Json,
  base: object,
  prefix: string,
) {
  for (const [key, f] of Object.entries(fields)) {
    // A join has no write operations.
    const ops: (keyof FieldAccess)[] = f.type === "join" ? ["read"] : ["read", "create", "update"];
    const denied: Json = {};
    for (const op of ops)
      if (!(await fieldAllowed(s, f, op, { ...base, path: prefix + key }))) denied[op] = false;
    if (Object.keys(denied).length) target[key].access = denied;

    if (f.type === "group" || f.type === "array")
      await fieldPermissions(s, f.fields, target[key].fields, base, `${prefix}${key}.`);
    if (f.type === "blocks")
      for (const [name, block] of Object.entries(blocksOf(f)))
        if (typeof target[key].blocks[name] === "object")
          await fieldPermissions(
            s,
            block.fields,
            target[key].blocks[name].fields,
            base,
            `${prefix}${key}.`,
          );
  }
}
