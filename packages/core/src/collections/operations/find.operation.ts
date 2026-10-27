import type { Core, Scope } from "../../cms/runtime/types.ts";
import type { LocalApi } from "../../cms/api/local-api.ts";
import { collectionTarget } from "../../content/targets.ts";
import { runOperation } from "../../content/lifecycle/run-operation.ts";
import { read } from "../../content/reads/read-documents.ts";

export async function find(
  core: Core,
  scope: Scope,
  collection: string,
  options: NonNullable<Parameters<LocalApi["find"]>[1]> = {},
) {
  return runOperation(
    core,
    scope,
    "read",
    collectionTarget(collection),
    { collection, options },
    (s, args) => read(core, s, collection, args.options),
  );
}

export async function findOne(
  core: Core,
  scope: Scope,
  collection: string,
  options: Parameters<LocalApi["findOne"]>[1],
) {
  return runOperation(
    core,
    scope,
    "read",
    collectionTarget(collection),
    { collection, options },
    async (s, args) => (await read(core, s, collection, { ...args.options, limit: 1 }))[0],
  );
}

export async function findById(
  core: Core,
  scope: Scope,
  collection: string,
  id: string,
  options: NonNullable<Parameters<LocalApi["findById"]>[2]> = {},
) {
  return runOperation(
    core,
    scope,
    "read",
    collectionTarget(collection),
    { collection, id, options },
    async (s, args) => (await read(core, s, collection, { ...args.options, id: args.id }))[0],
  );
}
