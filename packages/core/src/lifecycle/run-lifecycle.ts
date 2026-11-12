import { consola } from "consola";
import type { Kysely } from "kysely";
import type { LocalApi } from "../cms/api/local-api.ts";
import { outerScope } from "../cms/runtime/operation-context.ts";
import { databaseForScope, transaction } from "../cms/runtime/transaction.ts";
import type { Core } from "../cms/runtime/types.ts";
import type { Database } from "../db/types.ts";
import type { ErrorContext, LifecycleHooks } from "./types.ts";

/** The marker name of the host's seed. A plugin's is its name. */
const HOST = "";

const owners = (core: Core): { name: string; hooks: LifecycleHooks }[] => [
  ...core.plugins.map((plugin) => ({ name: plugin.name, hooks: plugin })),
  { name: HOST, hooks: core.lifecycle },
];

const serverApi = (core: Core) => core.localApi(outerScope({ user: null }, true));

/**
 * Runs the seeds that have no marker on this database, in one transaction. Whether the database is empty is read
 * before any seed writes, so a plugin's seed does not stop the host's.
 * `core.db` MUST be the connection without the start gate, or the seeds wait on themselves.
 */
export async function runSeeds(core: Core) {
  const seeds = owners(core).filter((o) => o.hooks.seed);
  if (!seeds.length) return;

  await transaction(core, outerScope({ user: null }, true), async (inner) => {
    const db = await databaseForScope(core, inner);
    const done = new Set(
      (await db.selectFrom("cms_seeds").select("name").execute()).map((r) => r.name),
    );
    const pending = seeds.filter((o) => !done.has(o.name));
    if (!pending.length) return;
    const empty = !(await hasContent(db));

    for (const { name, hooks } of pending) {
      const claimed = await db
        .insertInto("cms_seeds")
        .values({ name, seeded_at: Date.now() })
        .onConflict((oc) => oc.column("name").doNothing())
        .executeTakeFirst();
      // Another instance seeded it while this one waited.
      if (!Number(claimed.numInsertedOrUpdatedRows ?? 0)) continue;
      if (name === HOST && !empty) continue;
      await hooks.seed!({ cms: inner.cms });
    }
  });
}

/** Runs every `onInit`. `core.db` MUST be the connection without the start gate. */
export async function runInit(core: Core) {
  const cms = serverApi(core);
  for (const { hooks } of owners(core)) await hooks.onInit?.({ cms });
}

/** Runs every `afterImport` with `cms`, the API of the import's commit. */
export async function runAfterImport(
  core: Core,
  cms: LocalApi,
  ctx: Omit<Parameters<NonNullable<LifecycleHooks["afterImport"]>>[0], "cms">,
) {
  for (const { hooks } of owners(core)) await hooks.afterImport?.({ ...ctx, cms });
}

/**
 * Hands an unexpected error to every `afterError`. Never throws: a failing hook is logged.
 * @param cms Defaults to the server API. The start gate passes its own, so a hook's reads don't wait on the gate.
 */
export async function reportError(
  core: Core,
  ctx: Omit<ErrorContext, "cms">,
  cms: LocalApi = serverApi(core),
) {
  for (const { name, hooks } of owners(core)) {
    if (!hooks.afterError) continue;
    try {
      await hooks.afterError({ ...ctx, cms });
    } catch (failure) {
      consola
        .withTag("tenon")
        .error(`afterError of ${name ? `plugin "${name}"` : "the host"} failed:`, failure);
    }
  }
}

async function hasContent(db: Kysely<Database>) {
  const doc = await db.selectFrom("cms_documents").select("id").limit(1).executeTakeFirst();
  if (doc) return true;
  return !!(await db.selectFrom("cms_globals").select("name").limit(1).executeTakeFirst());
}
