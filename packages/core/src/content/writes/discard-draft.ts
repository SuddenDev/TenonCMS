import type { DeleteOptions } from "../../errors.ts";
import { type Core, type Scope } from "../../cms/runtime/types.ts";
import { type ContentTarget } from "../targets.ts";
import { runOperation } from "../lifecycle/run-operation.ts";
import { databaseForScope } from "../../cms/runtime/transaction.ts";
import { afterRead } from "../lifecycle/run-read-hooks.ts";
import { remove } from "./remove-document.ts";
import { discardGlobalDraft } from "../../db/queries/drafts/discard-global-draft.query.ts";
import { loadGlobal } from "../../db/queries/globals/load-global.query.ts";
import { loadDoc } from "../../db/queries/documents/load-document.query.ts";
import { discardDraft } from "../../db/queries/drafts/discard-draft.query.ts";
import { locOf } from "../reads/loc-of.ts";
import { discardLocalized } from "./discard-locale.ts";
import { guard } from "../../access/rule.ts";

/**
 * Drops the draft. A document that was never published is deleted, with its `onDelete` effects.
 * A localized entry drops the draft of the scope's locale, or with `all` every draft. See `discardLocalized()`.
 * It needs the `update` rule only: deleting a never-published document this way needs no `delete`.
 * @returns The published document after discarding the draft, or `undefined` if it was deleted or missing.
 * @throws {ForbiddenError} When the `update` rule denies.
 */
export const discard = async (
  core: Core,
  scope: Scope,
  name: ContentTarget,
  id?: string,
  all = false,
  options: DeleteOptions = {},
) => {
  const loc = await locOf(core, { ...scope, fallback: false }, name);

  if (name.kind === "global")
    return runOperation(core, scope, "setGlobal", name, { global: name.name }, async (s) => {
      await guard(core, s, name, "update");
      if (loc) return discardLocalized(core, s, name, name.name, loc, all, options);

      const db = await databaseForScope(core, s);
      await discardGlobalDraft(db, name.name);

      const doc = (await loadGlobal(db, name.name)) ?? { publishedAt: null, hasDraft: false };

      return (await afterRead(core, s, name, [doc], "setGlobal"))[0];
    });

  return runOperation(
    core,
    scope,
    "update",
    name,
    { collection: name.name, id },
    async (s, args) => {
      await guard(core, s, name, "update", { id: args.id });
      if (loc) return discardLocalized(core, s, name, args.id, loc, all, options);

      const db = await databaseForScope(core, s);
      const doc = await loadDoc(db, name.name, args.id, true);
      if (!doc) return undefined;

      if (doc.publishedAt === null) {
        // Part of the discard, which the `update` rule allowed.
        await remove(core, { ...s, overrideAccess: true }, name.name, args.id, options);
        return undefined;
      }

      const stored = await discardDraft(db, name.name, args.id);

      return (await afterRead(core, s, name, [stored], "update"))[0];
    },
  );
};
