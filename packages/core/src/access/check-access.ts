import type { Block, Fields, Schema } from "../schema/index.ts";
import { unseenBlocks } from "../schema/traversal/blocks-of.ts";
import type { Role } from "../users/roles.ts";

/**
 * Checks the `access` options at startup: every role a rule lists exists, and a join has a `read` rule only.
 * @throws {Error} For an unknown role or a write rule on a join.
 */
export function checkAccess(schema: Required<Schema>, roles: Role[]) {
  const known = new Set(roles.map((r) => r.name));

  for (const [kind, entries] of [
    ["collection", schema.collections],
    ["global", schema.globals],
  ] as const)
    for (const [name, entry] of Object.entries(entries)) {
      checkRoles(known, `${kind} "${name}"`, entry.access);
      walk(known, entry.fields, `${name}.`);
    }
}

/** Throws for a role in a rule list that no `roles` entry defines. Function rules are not checked. */
function checkRoles(known: Set<string>, owner: string, access: object | undefined) {
  for (const rule of Object.values(access ?? {}))
    for (const role of Array.isArray(rule) ? rule : [])
      if (!known.has(role)) throw new Error(`tenoncms: ${owner} names unknown role "${role}"`);
}

/** Checks the rules of each field, recursing into groups, arrays and blocks. `owner` is the dotted path so far. */
function walk(known: Set<string>, fields: Fields, owner: string, seen = new Set<Block>()) {
  for (const [key, f] of Object.entries(fields)) {
    checkRoles(known, `field "${owner}${key}"`, f.access);
    if (f.type === "join" && Object.keys(f.access ?? {}).some((op) => op !== "read"))
      throw new Error(`tenoncms: join "${owner}${key}" takes \`access.read\` only`);

    if (f.type === "group" || f.type === "array") walk(known, f.fields, `${owner}${key}.`, seen);
    if (f.type === "blocks")
      for (const [name, block] of unseenBlocks(f, seen))
        walk(known, block.fields, `${owner}${key}.${name}.`, seen);
  }
}
