import { type Core, type Scope } from "../../cms/runtime/types.ts";
import { type ContentTarget, target, targetKey } from "../targets.ts";
import { runOperation } from "../lifecycle/run-operation.ts";
import { databaseForScope } from "../../cms/runtime/transaction.ts";
import { actorId } from "../../cms/runtime/operation-context.ts";
import { hookArgs } from "../lifecycle/hook-args.ts";
import { slot } from "../lifecycle/collect-hooks.ts";
import { afterRead } from "../lifecycle/run-read-hooks.ts";
import { runHooks } from "../../schema/runtime/run-hooks.ts";
import { runFieldHooks } from "../../schema/runtime/run-field-hooks.ts";
import { DOCUMENT_LOCALES, GLOBAL_LOCALES } from "../../db/queries/document-sql.ts";
import { unpublishDoc, unpublishGlobal } from "../../db/queries/drafts/unpublish.query.ts";
import { unpublishLocale } from "../../db/queries/locales/unpublish-locale.query.ts";
import { recordVersion } from "../../db/queries/versions/record-version.query.ts";
import { ConflictError } from "../../errors.ts";
import { locOf } from "../reads/loc-of.ts";
import { loadSource } from "./write-document.ts";
import { guard } from "../../access/rule.ts";

/**
 * Takes the scope's locale, or an unlocalized entry, off the published perspective. The published data stays and an
 * existing draft is kept; without one, the published data becomes the draft. The shared row goes with the last
 * published locale. It records an `unpublished` version of the content that went offline, and runs `afterChange`
 * with the published document as `previousDoc`.
 * It needs the `update` rule. An entry that is not published is left as it is, and records nothing.
 * @param updatedAt The `updatedAt` the caller loaded, compared with the drafts perspective like a write does.
 * @returns The document in the drafts perspective, or `undefined` when it does not exist. A global that was never saved reads as unpublished.
 * @throws {ForbiddenError} When the `update` rule denies.
 * @throws {ConflictError} When `updatedAt` is stale.
 */
export const unpublish = (
  core: Core,
  scope: Scope,
  name: ContentTarget,
  id?: string,
  updatedAt?: string,
) => {
  const global = name.kind === "global";
  const operation = global ? "setGlobal" : "update";
  const args = global ? { global: name.name } : { collection: name.name, id };

  return runOperation(core, scope, operation, name, args, async (s, args) => {
    await guard(core, s, name, "update", { id: args.id });

    const db = await databaseForScope(core, s);
    const loc = await locOf(core, { ...s, fallback: false }, name);
    const pending = await loadSource(db, name, args.id, true, loc);
    if (!pending && !global) return undefined;
    if (updatedAt && pending?.updatedAt !== updatedAt)
      throw new ConflictError([], "Changed since it was loaded", "CHANGED");

    const before = pending?.publishedAt
      ? await loadSource(db, name, args.id, false, loc)
      : undefined;
    if (!before) {
      const doc = pending ?? { publishedAt: null, hasDraft: false };
      return (await afterRead(core, s, name, [doc], operation, true))[0];
    }

    const by = actorId(s);
    if (loc) {
      const owner = global ? name.name : args.id;
      await unpublishLocale(db, global ? GLOBAL_LOCALES : DOCUMENT_LOCALES, owner, loc.locale);
    }
    if (!loc || before.locales.length === 1) {
      if (global) await unpublishGlobal(db, name.name);
      else await unpublishDoc(db, name.name, args.id, by);
    }

    const { fields, maxVersions } = target(core, name);
    await recordVersion(db, {
      target: targetKey(name),
      docId: global ? "" : args.id,
      locale: loc?.locale ?? null,
      status: "unpublished",
      data: Object.fromEntries(Object.keys(fields).map((key) => [key, before[key]])),
      by,
      max: maxVersions,
    });

    const stored = (await loadSource(db, name, args.id, true, loc))!;
    await runFieldHooks("afterChange", fields, stored, {
      ...hookArgs(s, name, { operation, id: args.id, originalDoc: before }),
      data: stored,
    });
    const doc = await runHooks(
      slot(core, name, "afterChange"),
      "doc",
      stored,
      hookArgs(s, name, { operation, previousDoc: before }),
    );
    return (await afterRead(core, s, name, [doc], operation, true))[0];
  });
};
