import type { Awaitable, Fn, HookArgs, Operation, Slot } from "./index.ts";

/** Arguments of field hooks and `validate`. */
export type FieldArgs = HookArgs & {
  /** The whole document. Untyped. */
  data: Record<string, unknown>;
  /** The object that holds this field: `data` at the top level, the group's value inside a group. Untyped. */
  siblingData: Record<string, unknown>;
  /** The stored document before this write. Missing on create and on reads. Untyped. */
  originalDoc?: Record<string, unknown>;
  /** Dot path of the field, e.g. `seo.title`. */
  path: string;
  operation: Operation;
};

/** One field hook. It gets the field's value and MAY return a new one. */
export type FieldHook<V> = Fn<
  FieldArgs & {
    /** The field's value. Return a new value to replace it. */
    value: V | null | undefined;
  },
  V | null | undefined
>;

/** A field's custom check: `true`, or an error message. Method syntax makes the parameters bivariant, like `Fn`. */
export type Validate<V> = {
  validate(value: V | null | undefined, args: FieldArgs): Awaitable<true | string>;
}["validate"];

/**
 * Any validator that follows Standard Schema, like a zod, valibot or arktype schema. Only its issues are used:
 * the stored value stays the input, so transforms and coercion change nothing. See https://standardschema.dev.
 */
export type StandardSchema = {
  readonly "~standard": {
    validate(
      value: unknown,
    ): Awaitable<{ readonly issues?: ReadonlyArray<{ readonly message: string }> }>;
  };
};

/** Hooks of one field. A hook MAY return a new value; `undefined` keeps the old one. */
export type FieldHooks<V> = {
  /** Runs on unvalidated input, before schema validation. */
  beforeValidate?: Slot<FieldHook<V>>;
  /** Runs on validated data, before the write. Its result is validated again. */
  beforeChange?: Slot<FieldHook<V>>;
  /** Runs after the write, on the stored document. */
  afterChange?: Slot<FieldHook<V>>;
  /** Runs once per document on every read and after writes. */
  afterRead?: Slot<FieldHook<V>>;
};
