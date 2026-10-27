import { consola } from "consola";
import type { Kysely } from "kysely";
import type { Database } from "../../db/types.ts";
import { type Core, type Scope, type Inner } from "./types.ts";
import { contextOf, inner } from "./operation-context.ts";

type Effect = (scope: Inner) => Promise<unknown>;

/** Shared by nested writes. Only the transaction owner finalizes its effects. */
export type TransactionLifetime = {
  database: Kysely<Database>;
  commit: Effect[];
  rollback: Effect[];
  failure?: { error: unknown };
};

/** The scope's transaction connection, or the instance's live connection. */
export const databaseForScope = async (core: Core, scope: Scope) =>
  scope.transaction?.database ?? (await core.db());

/** Schedules awaited work after the outer commit, with a fresh bound API. */
export function afterCommit(scope: Inner, effect: Effect) {
  scope.transaction!.commit.push(effect);
}

/** Registers compensation after outer rollback. Compensations run in reverse order. */
export function onRollback(scope: Inner, effect: Effect) {
  scope.transaction!.rollback.push(effect);
}

/**
 * Runs a write in the shared lifetime. Any nested write failure prevents commit, even if a hook catches it.
 * Rollback compensation is best effort and cannot replace the write error. Commit work cannot trigger rollback.
 */
export async function transaction<R>(
  core: Core,
  scope: Scope,
  fn: (scope: Inner) => Promise<R>,
): Promise<R> {
  const context = contextOf(scope);
  if (scope.transaction) {
    try {
      return await fn(inner(core, scope, scope.transaction, context));
    } catch (error) {
      scope.transaction.failure ??= { error };
      throw error;
    }
  }

  let lifetime: TransactionLifetime | undefined;
  const outside = () => inner(core, scope, undefined, context);
  let result: R;
  try {
    result = await (await core.db()).transaction().execute(async (database) => {
      lifetime = { database, commit: [], rollback: [] };
      const result = await fn(inner(core, scope, lifetime, context));
      if (lifetime.failure) throw lifetime.failure.error;
      return result;
    });
  } catch (error) {
    for (const compensate of lifetime?.rollback.slice().reverse() ?? []) {
      try {
        await compensate(outside());
      } catch (failure) {
        consola.withTag("integral").error(failure);
      }
    }
    throw error;
  }

  let commitFailure: { error: unknown } | undefined;
  for (const effect of lifetime!.commit) {
    try {
      await effect(outside());
    } catch (error) {
      commitFailure ??= { error };
    }
  }
  if (commitFailure) throw commitFailure.error;
  return result;
}

/** Includes validation and streaming failures outside operation callbacks in an inherited write lifetime. */
export function trackWrite<Args extends unknown[], Result>(
  scope: Scope,
  write: (...args: Args) => Promise<Result>,
): (...args: Args) => Promise<Result> {
  if (!scope.transaction) return write;
  return async (...args) => {
    try {
      return await write(...args);
    } catch (error) {
      scope.transaction!.failure ??= { error };
      throw error;
    }
  };
}
