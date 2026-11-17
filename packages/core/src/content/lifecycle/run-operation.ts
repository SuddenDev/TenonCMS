import { ConflictError, ForbiddenError, ValidationError } from "../../errors.ts";
import { runHooks } from "../../schema/runtime/run-hooks.ts";
import { type Operation } from "../../schema/index.ts";
import { type Core, type Scope, type Inner, type Stage } from "../../cms/runtime/types.ts";
import { transaction } from "../../cms/runtime/transaction.ts";
import { contextOf, inner } from "../../cms/runtime/operation-context.ts";
import { type ContentTarget } from "../targets.ts";
import { hookArgs } from "./hook-args.ts";
import { slot } from "./collect-hooks.ts";
import { consola } from "consola";

/**
 * Runs one content operation: find, create, update, delete, get, set, publish, unpublish, discard, copy-locale,
 * remove-locale or sync-structure. Collection calls run `beforeOperation` and `afterOperation`.
 * Writes run in one transaction with their hooks and nested calls. Reads open none.
 *
 * @returns The result of `fn` after `afterOperation` hooks.
 */
export async function runOperation<R>(
  core: Core,
  scope: Scope,
  operation: Operation,
  name: ContentTarget,
  args: Record<string, any>,
  fn: (s: Inner, args: Record<string, any>) => Promise<R>,
): Promise<R> {
  const context = contextOf(scope);

  // Globals have no `beforeOperation` and `afterOperation`, root ones included.
  const of = (stage: Stage) => (name.kind === "collection" ? slot(core, name, stage) : undefined);

  const body = async (s: Inner) => {
    const base = hookArgs(s, name, { operation, draft: args.draft === true });

    const input = await runHooks(of("beforeOperation"), "args", args, base);
    const result = await fn(s, input);
    return runHooks(of("afterOperation"), "result", result, { ...base, args: input });
  };

  const isWrite = operation !== "read" && operation !== "getGlobal";
  try {
    if (isWrite) return await transaction(core, scope, body);
    return await body(inner(core, scope, scope.transaction, context));
  } catch (error) {
    await runAfterError(core, scope, context, name, operation, error);
    throw error;
  }
}

/**
 * Runs the `afterError` hooks for a failed call. It MUST run after the rollback: the hooks get an API bound to no
 * transaction. Only the outermost call runs them, so a nested `scope` runs none. 400, 401, 403 and 409 are expected
 * and run none. An error in a hook is logged and never replaces `error`.
 * @param context The hook context of the failed call.
 */
export async function runAfterError(
  core: Core,
  scope: Scope,
  context: Scope["context"],
  name: ContentTarget,
  operation: Operation,
  error: unknown,
) {
  const expected =
    error instanceof ValidationError ||
    error instanceof ConflictError ||
    error instanceof ForbiddenError;
  if (scope.nested || expected) return;

  const s = inner(core, scope, undefined, context);
  const args = hookArgs(s, name, { operation, error });
  for (const fn of slot(core, name, "afterError")) {
    try {
      await fn(args);
    } catch (e) {
      consola.withTag("tenon").error(e);
    }
  }
}
