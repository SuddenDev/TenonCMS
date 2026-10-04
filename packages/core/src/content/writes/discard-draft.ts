import { type Core, type Scope } from "../../cms/runtime/types.ts";
import { type Name } from "../targets.ts";
import { run } from "../lifecycle/run-operation.ts";
import { q } from "../../cms/runtime/transaction.ts";
import { afterRead } from "../reads/run-read-hooks.ts";
import { remove } from "./remove-document.ts";
import { discardGlobalDraft } from "../../db/queries/drafts/discard-global-draft.query.ts";
import { loadGlobal } from "../../db/queries/globals/load-global.query.ts";
import { loadDoc } from "../../db/queries/documents/load-document.query.ts";
import { discardDraft } from "../../db/queries/drafts/discard-draft.query.ts";

/**
 * Drops the draft. A document that was never published is deleted, with its `onDelete` effects.
 * Returns the published document, or `undefined` when it is deleted or missing.
 */
export const discard = (core: Core, scope: Scope, name: Name, id?: string) =>
  name.kind === "global"
    ? run(core, scope, "setGlobal", name, { global: name.name }, async (s) => {
        const db = await q(core, s);
        await discardGlobalDraft(db, name.name);
        const doc = (await loadGlobal(db, name.name)) ?? { publishedAt: null, hasDraft: false };
        return (await afterRead(core, s, name, [doc], "setGlobal"))[0];
      })
    : run(core, scope, "update", name, { collection: name.name, id }, async (s, args) => {
        const db = await q(core, s);
        const doc = await loadDoc(db, name.name, args.id, true);
        if (!doc) return undefined;
        if (doc.publishedAt === null) {
          await remove(core, s, name.name, args.id);
          return undefined;
        }
        const stored = await discardDraft(db, name.name, args.id);
        return (await afterRead(core, s, name, [stored], "update"))[0];
      });
