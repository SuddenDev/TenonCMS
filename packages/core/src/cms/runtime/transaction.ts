import { type Core, type Scope, type Inner } from "./types.ts";
import { contextOf, inner } from "./operation-context.ts";

/** The transaction of the scope, or a plain connection. */
export const q = async (core: Core, s: Scope) => s.trx ?? (await core.db());
/** Runs `fn` in the scope's transaction, or in a new one. Hooks inside share it. */
export async function transaction<R>(
  core: Core,
  scope: Scope,
  fn: (s: Inner) => Promise<R>,
): Promise<R> {
  const context = contextOf(scope);
  if (scope.trx) return fn(inner(core, scope, scope.trx, context));
  return (await core.db()).transaction().execute((trx) => fn(inner(core, scope, trx, context)));
}
