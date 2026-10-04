import type { Fields } from "../fields/index.ts";
import type { Data, Doc } from "../inference.ts";
import type { Fn, HookArgs, Operation, Slot } from "./index.ts";

// A collection written inline in `defineCms` has the wide `Fields`, so its hooks get `any`.
export type D<F extends Fields> = Fields extends F ? any : Data<F>;
export type DocOf<F extends Fields> = Fields extends F ? any : Doc<F>;

type ChangeArgs = HookArgs & {
  operation: Operation;
  /** Id of the document. Missing on create and for globals. */
  id?: string;
};

/**
 * Hooks of a collection. Each hook gets one object and MAY be async. A hook MAY return a replacement for its main value
 * (`args`, `data`, `doc`, `docs`, `result`); `undefined` keeps it.
 *
 * Order of a write: `beforeOperation` → defaults (create) → `beforeValidate` → validation → field `validate` → `beforeChange` → validation →
 * `unique` → write → `afterChange` → `afterRead` → `afterOperation`.
 * Field hooks of a stage run before the collection's.
 */
export type CollectionHooks<F extends Fields> = {
  /** Runs first in every operation. `args` is the operation's input, e.g. `{ collection, id, data }`. */
  beforeOperation?: Slot<
    Fn<HookArgs & { operation: Operation; args: Record<string, unknown> }, Record<string, unknown>>
  >;
  /** Runs on unvalidated input of `create` and `update`. The result is validated. */
  beforeValidate?: Slot<
    Fn<ChangeArgs & { data: Partial<D<F>>; originalDoc?: DocOf<F> }, Partial<D<F>>>
  >;
  /** Runs on validated data, before the write. The result MUST pass validation again. */
  beforeChange?: Slot<Fn<ChangeArgs & { data: D<F>; originalDoc?: DocOf<F> }, D<F>>>;
  /** Runs after the write, in the same transaction. `previousDoc` is missing on create. */
  afterChange?: Slot<
    Fn<HookArgs & { operation: Operation; doc: DocOf<F>; previousDoc?: DocOf<F> }, DocOf<F>>
  >;
  /** Runs once per read on the loaded documents, before relations are resolved. */
  beforeRead?: Slot<Fn<HookArgs & { operation: Operation; docs: DocOf<F>[] }, DocOf<F>[]>>;
  /** Runs once per read on all returned documents, and after writes on the written one. */
  afterRead?: Slot<Fn<HookArgs & { operation: Operation; docs: DocOf<F>[] }, DocOf<F>[]>>;
  /** Runs before a document is deleted. Does not run for a missing document. */
  beforeDelete?: Slot<Fn<HookArgs & { id: string; doc: DocOf<F> }, void>>;
  /** Runs after the document and its `onDelete` effects are deleted, in the same transaction. */
  afterDelete?: Slot<Fn<HookArgs & { id: string; doc: DocOf<F> }, void>>;
  /** Runs last in every operation. `result` is what the operation returns. */
  afterOperation?: Slot<
    Fn<HookArgs & { operation: Operation; args: Record<string, unknown>; result: unknown }, unknown>
  >;
  /**
   * Runs after an unexpected error, once the transaction is rolled back, then the root `afterError`.
   * Does not run for `ValidationError` (400) or `ConflictError` (409). The error is rethrown.
   */
  afterError?: Slot<Fn<HookArgs & { operation: Operation; error: unknown }, void>>;
};
