import { ForbiddenError } from "../errors.ts";
import type { Core, Inner, Scope } from "../cms/runtime/types.ts";
import { contextOf, inner } from "../cms/runtime/operation-context.ts";
import { q } from "../cms/runtime/transaction.ts";
import { type Name, target } from "../content/targets.ts";
import { hookArgs } from "../content/lifecycle/hook-args.ts";
import { locOf } from "../content/reads/loc-of.ts";
import { loadDoc } from "../db/queries/documents/load-document.query.ts";
import type { Access, Rule, Where } from "./types.ts";

/** An operation of a collection rule. Globals use `read` and `update`. */
export type Op = keyof Access;

const signedIn = ({ user }: { user: unknown }) => !!user;

/** The rule when a slot is missing: drafts and writes need a user. */
const DEFAULTS: Record<Op, Rule<any, boolean>> = {
  read: ({ user, draft }: { user: unknown; draft: boolean }) => !draft || !!user,
  create: signedIn,
  update: signedIn,
  delete: signedIn,
};

/** The read rule of a `private` field. */
export const PRIVATE: Rule<object> = signedIn;

/**
 * Runs one rule for the user of `s`. A missing rule allows.
 * @returns The rule's result: `true`, `false` or a `Where`.
 */
export async function check<R>(s: Inner, rule: Rule<any, R> | undefined, args: object) {
  if (rule === undefined || typeof rule === "boolean") return rule ?? true;
  if (Array.isArray(rule)) return !!s.user && rule.includes(s.user.role ?? "editor");
  return (rule as (args: object) => R | Promise<R>)(args);
}

/**
 * Decides operation `op` on a collection or global for the caller of `s`. A scope with `overrideAccess` is allowed.
 * @returns `true`, `false`, or a `Where` the documents MUST match.
 */
export async function decide(
  core: Core,
  s: Inner,
  name: Name,
  op: Op,
  extra: object = {},
): Promise<boolean | Where> {
  if (s.overrideAccess) return true;
  const access = target(core, name).access as Access | undefined;
  return check(s, access?.[op] ?? DEFAULTS[op], hookArgs(s, name, extra));
}

/**
 * Decides `op` like {@link decide}, and throws when the rule denies outright. It runs before a document is loaded, so a
 * denied caller learns nothing about missing documents.
 * @returns `true`, or a `Where` the documents MUST match.
 * @throws {ForbiddenError} When the rule returns `false`.
 */
export async function permit(core: Core, s: Inner, name: Name, op: Op, extra: object = {}) {
  const decision = await decide(core, s, name, op, extra);
  if (decision === false) throw denied(s);
  return decision;
}

/**
 * Whether `doc` holds every value of `where`. `null` matches an empty or missing value.
 * @returns `true` on a match.
 */
export function matches(doc: Record<string, any>, where: Where) {
  return Object.entries(where).every(([key, value]) =>
    value === null ? doc[key] == null : doc[key] === value,
  );
}

/**
 * Throws unless `decision` allows: `true`, or a `Where` that `doc` matches. Without `doc`, a `Where` denies.
 * @throws {ForbiddenError} 401 without a user, else 403.
 */
export function enforce(s: Inner, decision: boolean | Where, doc?: Record<string, any>) {
  if (decision === true) return;
  if (decision !== false && doc && matches(doc, decision)) return;
  throw denied(s);
}

/**
 * Decides and enforces `op` for one document or global. A `Where` loads document `id` as the drafts perspective reads
 * it in the scope's locale; a missing document passes, so the operation answers as it does without rules.
 * @throws {ForbiddenError} When the rule denies.
 */
export async function guard(
  core: Core,
  s: Inner,
  name: Name,
  op: Op,
  extra: { id?: string; data?: unknown } = {},
) {
  const decision = await permit(core, s, name, op, extra);
  if (decision === true || !extra.id) return enforce(s, decision);

  const loc = locOf(core, s, target(core, name));
  const doc = await loadDoc(await q(core, s), name.name, extra.id, true, loc);
  if (doc) enforce(s, decision, doc);
}

/**
 * For an operation across documents, like a media folder rename: the rule MUST allow without a `where`.
 * @throws {ForbiddenError} When the rule denies or returns a `where`.
 */
export async function guardAll(core: Core, scope: Scope, name: Name, op: Op) {
  const s = inner(core, scope, scope.trx, contextOf(scope));
  enforce(s, await decide(core, s, name, op, op === "read" ? { draft: false } : {}));
}

/**
 * The read rule of the caller of `scope` on published documents, for routes that read outside the local API, like the
 * media folders. `id` names the document when there is one.
 * @returns `true`, or a `Where` the documents MUST match.
 * @throws {ForbiddenError} When the rule denies.
 */
export async function readAccess(core: Core, scope: Scope, name: Name, id?: string) {
  const s = inner(core, scope, scope.trx, contextOf(scope));
  return permit(core, s, name, "read", { draft: false, id });
}

/**
 * Whether the caller of `scope` MAY read the published document `doc`, for routes that serve it outside a read. The
 * rule runs first, so a denied caller learns nothing about missing documents.
 * @returns `false` for a missing `doc` and one outside the rule's `where`.
 * @throws {ForbiddenError} When the rule denies.
 */
export async function readable(
  core: Core,
  scope: Scope,
  name: Name,
  doc: Record<string, any> | undefined,
) {
  const decision = await readAccess(core, scope, name, doc?.id);
  return !!doc && (decision === true || matches(doc, decision));
}

/** The error of a denied caller: 401 without a user, else 403. */
function denied(s: Inner) {
  return new ForbiddenError(s.user ? 403 : 401);
}
