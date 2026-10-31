import type { Core } from "../../cms/runtime/types.ts";
import type { Db } from "../../db/queries/document-sql.ts";
import { LinkedContentError } from "../../errors.ts";
import { linkOwners } from "./find-owners.ts";
import { heldLinks, type HeldLink } from "../runtime/held-links.ts";

/**
 * Warns before deletion and records broken references without removing content or identities. Call inside the
 * deletion transaction.
 * @param allowed Whether the caller confirmed with `allowBrokenLinks`.
 * @throws {LinkedContentError} With one entry per owner value and field, when links point to the target and `allowed` is not set.
 */
export async function breakLinks(
  db: Db,
  core: Core,
  collection: string,
  id: string,
  allowed = false,
) {
  const owners = await linkOwners(db, core);
  const affected = owners
    .filter((row) => row.owner.collection !== collection || row.owner.id !== id)
    .flatMap((row) => {
      const byField = new Map<string, HeldLink[]>();
      for (const held of heldLinks(row.fields, row.data)) {
        const { reference: r } = held;
        if (r.collection !== collection || r.id !== id || r.deleted) continue;
        byField.set(held.path, [...(byField.get(held.path) ?? []), held]);
      }
      return [...byField].map(([field, refs]) => ({ row, field, refs }));
    });

  if (affected.length && !allowed)
    throw new LinkedContentError(affected.map(({ row, field }) => ({ ...row.owner, field })));

  for (const item of affected)
    for (const held of item.refs) {
      held.reference.deleted = true;
      held.clear();
    }

  for (const row of new Set(affected.map((a) => a.row))) await row.save(row.data);
}
