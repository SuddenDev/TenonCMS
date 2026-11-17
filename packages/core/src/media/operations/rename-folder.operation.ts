import { consola } from "consola";
import { z } from "zod";
import type { Core, Scope } from "../../cms/runtime/types.ts";
import { databaseForScope } from "../../cms/runtime/transaction.ts";
import { findDocs } from "../../db/queries/documents/find-documents.query.ts";
import { ConflictError, ForbiddenError, ValidationError } from "../../errors.ts";
import { cleanFolder } from "../library/names.ts";
import { update } from "./update/update.operation.ts";
import { collectionTarget } from "../../content/targets.ts";
import { guardAll } from "../../access/rule.ts";
import { validateInput } from "../../schema/validation/validate-input.ts";

const log = consola.withTag("tenon");
const renameInput = z.object({ from: z.string(), to: z.string() });

/**
 * `cms.media.renameFolder()`: moves every file under `from` to `to`, one by one. Running it again finishes a partial
 * rename. `media.access.update` MUST allow without a `where`.
 * @returns The number of moved files, and the files that failed with the reason. An unexpected error is logged and
 * reported with a generic reason, because its message MAY hold storage internals.
 * @throws {ValidationError} For `from` or `to` that is not a valid folder.
 */
export async function renameFolder(core: Core, scope: Scope, fromInput: string, toInput: string) {
  await guardAll(core, scope, collectionTarget("media"), "update");
  const names = validateInput(renameInput, { from: fromInput, to: toInput });
  const from = cleanFolder(names.from);
  const to = cleanFolder(names.to);
  if (!from) throw new ValidationError({ from: "Invalid folder" });
  if (to === from || to.startsWith(`${from}/`))
    throw new ValidationError({ to: "Cannot move a folder into itself" });

  // ponytail: loads every media document. Add a SQL prefix filter if libraries grow large.
  const docs = (await findDocs(await databaseForScope(core, scope), "media", {})).filter(
    (d) => d.folder === from || String(d.folder).startsWith(`${from}/`),
  );

  // One failed file does not stop the others.
  const failed: { id: string; message: string }[] = [];
  for (const doc of docs) {
    const folder = [to, doc.folder.slice(from.length + 1)].filter(Boolean).join("/");
    try {
      await update(core, scope, doc.id, { folder });
    } catch (error) {
      failed.push({ id: doc.id, message: failureOf(error) });
    }
  }
  return { moved: docs.length - failed.length, failed };
}

function failureOf(error: unknown) {
  const expected =
    error instanceof ValidationError ||
    error instanceof ForbiddenError ||
    error instanceof ConflictError;
  if (expected) return error.message;
  log.error(error);
  return "Could not move the file";
}
