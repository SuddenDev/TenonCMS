import type { Core } from "../../cms/runtime/types.ts";
import type { Db } from "../../db/queries/document-sql.ts";
import { LinkedContentError } from "../../errors.ts";
import { richtextOwners } from "./find-owners.ts";
import { richtextFields } from "../runtime/fields.ts";
import { richtextReferences } from "../runtime/walk.ts";

/** Warns before deletion and records broken references without removing content or identities. */
export async function breakRichtextLinks(
  db: Db,
  core: Core,
  collection: string,
  id: string,
  allowed = false,
) {
  const owners = await richtextOwners(db, core);
  const affected = owners
    .flatMap((row) =>
      richtextFields(row.fields, row.data).flatMap((field) => {
        const refs = richtextReferences(field.value).filter(
          (r) =>
            r.reference.collection === collection && r.reference.id === id && !r.reference.deleted,
        );
        return refs.length ? [{ row, field: field.path, refs }] : [];
      }),
    )
    .filter(({ row }) => row.owner.collection !== collection || row.owner.id !== id);

  if (affected.length && !allowed)
    throw new LinkedContentError(affected.map(({ row, field }) => ({ ...row.owner, field })));

  for (const item of affected)
    for (const { node, reference } of item.refs) {
      reference.deleted = true;
      delete node.attrs!.href;
      delete node.attrs!.src;
      delete node.attrs!.srcset;
    }

  for (const row of new Set(affected.map((a) => a.row))) await row.save(row.data);
}
