import type { Core, Inner } from "../../cms/runtime/types.ts";
import { type ContentTarget, target } from "../targets.ts";
import { databaseForScope } from "../../cms/runtime/transaction.ts";
import { hookArgs } from "../lifecycle/hook-args.ts";
import { loadGlobal } from "../../db/queries/globals/load-global.query.ts";
import { loadDoc } from "../../db/queries/documents/load-document.query.ts";
import { loadLocaleDoc } from "../../db/queries/locales/load-locale-doc.query.ts";
import type { Db, Loc } from "../../db/queries/document-sql.ts";
import { locOf } from "../reads/loc-of.ts";
import { prepareData } from "./prepare-data.ts";
import { persistDocument } from "./persist-document.ts";
import { guard } from "../../access/rule.ts";
import { dropDenied } from "../../access/field-access.ts";
import { ConflictError } from "../../errors.ts";

export type WriteMode = "save" | "draft" | "publish" | "deletion-effect";
export type WriteOperation = "create" | "update" | "setGlobal";

type WriteRequest = {
  target: ContentTarget;
  operation: WriteOperation;
  input: unknown;
  id?: string;
  mode?: WriteMode;
  /** The `updatedAt` the caller loaded. A newer stored document refuses the write. */
  updatedAt?: string;
};

/** Facts of one write, shared only by its preparation and persistence stages. */
export type WriteState = {
  core: Core;
  scope: Inner;
  database: Db;
  target: ContentTarget;
  operation: WriteOperation;
  id?: string;
  mode: WriteMode;
  fields: ReturnType<typeof target>["fields"];
  locale?: Loc;
  source?: Record<string, any>;
  sourceData?: Record<string, any>;
  originalDoc?: Record<string, any>;
  args: ReturnType<typeof hookArgs> & {
    operation: WriteOperation;
    originalDoc?: Record<string, any>;
  };
};

/**
 * Owns access, source selection, preparation and persistence for saves, drafts, publishing and deletion effects.
 * Drafts run before hooks and type checks, but skip custom validation, integrity and after-change hooks.
 * Publish compares hooks against published content. Deletion effects bypass access and reference checks.
 * A stale `updatedAt` throws a `ConflictError` after access and before any hook.
 * @returns The document after read hooks, or `undefined` for a missing update target.
 */
export async function writeDocument(core: Core, scope: Inner, request: WriteRequest) {
  const { target: name, operation, id, mode = "save" } = request;
  const entry = target(core, name);
  const database = await databaseForScope(core, scope);
  const locale = locOf(core, { ...scope, fallback: false }, entry);
  const accessOperation = operation === "create" ? "create" : "update";
  if (mode !== "deletion-effect") {
    await guard(core, scope, name, accessOperation, { id, data: request.input });
  }

  const source = await loadSource(
    database,
    name,
    id,
    mode === "draft" || mode === "publish",
    locale,
  );
  if (id && !source) return undefined;
  // ponytail: millisecond token. Two writes in the same millisecond pass; add a version column if that matters.
  if (request.updatedAt && source?.updatedAt !== request.updatedAt)
    throw new ConflictError([], "Changed since it was loaded", "CHANGED");
  const originalDoc =
    mode === "publish" ? await loadSource(database, name, id, false, locale) : source;
  const sourceData = locale && source ? withoutLocaleMeta(source) : source;
  const args = hookArgs(scope, name, { operation, id, originalDoc, draft: mode === "draft" });
  const state: WriteState = {
    core,
    scope,
    database,
    target: name,
    operation,
    id,
    mode,
    fields: entry.fields,
    locale,
    source,
    sourceData,
    originalDoc,
    args,
  };

  const input =
    mode === "deletion-effect"
      ? request.input
      : await dropDenied(core, scope, name, accessOperation, request.input, sourceData);
  const preparedData = await prepareData(state, input);
  return persistDocument(state, preparedData);
}

async function loadSource(
  db: Db,
  name: ContentTarget,
  id: string | undefined,
  drafts: boolean,
  loc?: Loc,
) {
  if (loc && (name.kind === "global" || id)) return loadLocaleDoc(db, name, id ?? "", drafts, loc);
  if (name.kind === "global") return loadGlobal(db, name.name, drafts);
  return id ? loadDoc(db, name.name, id, drafts) : undefined;
}

// Read metadata is reserved only on localized targets.
const withoutLocaleMeta = ({ locale, locales, sharedDraft, ...data }: Record<string, any>) => data;
