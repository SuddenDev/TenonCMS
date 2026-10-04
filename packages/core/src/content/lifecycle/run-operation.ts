import { ConflictError, ValidationError } from "../../errors.ts";
import { runHooks } from "../../schema/hooks/run.ts";
import { type Operation } from "../../schema/index.ts";
import { type Core, type Scope, type Inner, type Stage } from "../../cms/runtime/types.ts";
import { contextOf, inner } from "../../cms/runtime/operation-context.ts";
import { type Name } from "../targets.ts";
import { hookArgs } from "./hook-args.ts";
import { slot } from "./collect-hooks.ts";
import { consola } from "consola";

/**
 * Every local API call goes through here. Collection calls run `beforeOperation` and `afterOperation`.
 * Writes run in one transaction with their hooks and nested calls. Reads open none.
 */
export async function run<R>(
  core: Core,
  scope: Scope,
  operation: Operation,
  name: Name,
  args: Record<string, any>,
  fn: (s: Inner, args: Record<string, any>) => Promise<R>,
): Promise<R> {
  const context = contextOf(scope);
  // Globals have no `beforeOperation` and `afterOperation`, root ones included.
  const of = (stage: Stage) => (name.kind === "collection" ? slot(core, name, stage) : undefined);
  const body = async (trx = scope.trx) => {
    const s = inner(core, scope, trx, context);
    const base = hookArgs(s, name, { operation, draft: args.draft === true });
    const input = await runHooks(of("beforeOperation"), "args", args, base);
    const result = await fn(s, input);
    return runHooks(of("afterOperation"), "result", result, { ...base, args: input });
  };
  const inTransaction = operation !== "read" && operation !== "getGlobal" && !scope.trx;
  try {
    if (!inTransaction) return await body();
    return await (await core.db()).transaction().execute((trx) => body(trx));
  } catch (error) {
    // Only the outermost call runs `afterError`, after the rollback. 400 and 409 are expected and run none.
    const expected = error instanceof ValidationError || error instanceof ConflictError;
    if (!scope.nested && !expected)
      await afterError(core, inner(core, scope, undefined, context), name, operation, error);
    throw error;
  }
}

// An error in an `afterError` hook MUST NOT replace the original.
async function afterError(core: Core, s: Inner, name: Name, operation: Operation, error: unknown) {
  const args = hookArgs(s, name, { operation, error });
  for (const fn of slot(core, name, "afterError")) {
    try {
      await fn(args);
    } catch (e) {
      consola.withTag("integral").error(e);
    }
  }
}
