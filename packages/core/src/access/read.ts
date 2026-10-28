import type { Core, Inner, Scope } from "../cms/runtime/types.ts";
import { contextOf, inner, outerScope } from "../cms/runtime/operation-context.ts";
import { caller } from "../auth/get-caller.ts";
import { type ContentTarget, collectionTarget, target } from "../content/targets.ts";
import { hookArgs } from "../content/lifecycle/hook-args.ts";
import { filterable } from "../schema/traversal/filterable.ts";
import { mediaByKey } from "../db/queries/media/media-by-key.query.ts";
import { ValidationError } from "../errors.ts";
import { decide, enforce, matches } from "./rule.ts";
import { fieldAllowed } from "./field-access.ts";
import type { Where } from "./types.ts";

/** Decides read admission in the caller's locale and perspective. Denial remains a value for optional targets. */
export function readDecision(
  core: Core,
  scope: Inner,
  name: ContentTarget,
  document: { id?: string } = {},
) {
  return decide(core, scope, name, "read", { draft: scope.perspective === "drafts", ...document });
}

/** Requires read admission before a query. A returned filter MUST constrain the query. */
export async function requireRead(
  core: Core,
  scope: Inner,
  name: ContentTarget,
  document: { id?: string } = {},
) {
  const decision = await readDecision(core, scope, name, document);
  if (decision === false) enforce(scope, decision);
  return decision as true | Where;
}

/** Whether a loaded row passes read admission. Missing rows never pass. */
export function admitsRead(decision: boolean | Where, doc: Record<string, any> | undefined) {
  return !!doc && (decision === true || (decision !== false && matches(doc, decision)));
}

/** Filters loaded targets before their read hooks. Denied optional targets yield no rows. */
export function admittedRows<T extends Record<string, any>>(
  decision: boolean | Where,
  docs: T[],
): T[] {
  return decision === true ? docs : docs.filter((doc) => admitsRead(decision, doc));
}

/** Checks field query eligibility without a document. Result stripping evaluates each actual document separately. */
export function canQueryField(core: Core, scope: Inner, name: ContentTarget, key: string) {
  const field = target(core, name).fields[key];
  return !!field && fieldAllowed(scope, field, "read", { ...hookArgs(scope, name, {}), path: key });
}

/** Validates filter keys and their read rules before querying. Unknown and unfilterable keys retain their errors. */
export async function checkReadWhere(
  core: Core,
  scope: Inner,
  name: ContentTarget,
  where?: object,
) {
  const { fields } = target(core, name);
  const denied = (key: string) => new ValidationError({ [key]: "Not filterable" });
  for (const key of Object.keys(where ?? {})) {
    if (key === "createdBy" || key === "updatedBy") {
      if (!scope.user && !scope.apiKey && !scope.overrideAccess) throw denied(key);
      continue;
    }
    if (!Object.hasOwn(fields, key)) throw new Error(`Unknown field "${key}"`);
    if (!filterable(fields, key)) throw new Error(`Field "${key}" is not filterable`);
    if (!(await canQueryField(core, scope, name, key))) throw denied(key);
  }
}

/** Requires published read admission for raw reads. The scope's locale and access override remain intact. */
export function readAccess(core: Core, scope: Scope, name: ContentTarget, id?: string) {
  const published = inner(
    core,
    { ...scope, perspective: "published" },
    scope.transaction,
    contextOf(scope),
  );
  return requireRead(core, published, name, { id });
}

/** Requires unrestricted published access for aggregate actions such as archive downloads. */
export async function requireAllRead(core: Core, scope: Scope, name: ContentTarget) {
  const decision = await readAccess(core, scope, name);
  enforce(inner(core, scope, scope.transaction, contextOf(scope)), decision);
}

/** Checks a raw published document without content hooks. Outright denial throws; missing or filtered rows return false. */
export async function readable(
  core: Core,
  scope: Scope,
  name: ContentTarget,
  doc: Record<string, any> | undefined,
) {
  return admitsRead(await readAccess(core, scope, name, doc?.id), doc);
}

/**
 * Admits published media for byte serving without content hooks. Only an omitted read rule skips session lookup.
 * Reserved storage keys and unpublished or missing documents return `undefined`.
 */
export async function publishedMedia(core: Core, request: Request, key: string) {
  const doc = key.startsWith(".") ? undefined : await mediaByKey(await core.db(), key);
  if (core.schema.collections.media.access?.read === undefined) return doc;
  const visitor = await caller(core, request);
  return (await readable(core, outerScope(visitor), collectionTarget("media"), doc))
    ? doc
    : undefined;
}
