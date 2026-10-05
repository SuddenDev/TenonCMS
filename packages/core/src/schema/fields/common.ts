import type { Condition } from "../condition.ts";
import type { FieldHooks, Fn, HookArgs, Validate } from "../hooks/index.ts";

/** Options of every field, joins included. */
export type Common = {
  /** Label in the admin. Defaults to the field key. */
  label?: string;
  /** Help text below the input in the admin. */
  description?: string;
  /**
   * The field applies only when this matches the document. Otherwise the admin hides it and saves it as `null`,
   * and the server skips `required`, the built-in checks and `validate`. The type check still runs. See {@link Condition}.
   */
  condition?: Condition;
  /** Sent over HTTP only with a session, so the admin sees it and public reads do not. Not filterable without a session. On a group, it applies to the whole group. */
  private?: boolean;
};

/** Options of every stored field. `V` is the value hooks see. `S` is the stored value, which `default` and `validate` get. */
export type Base<V = string, S = V> = Common & {
  /** The value MUST be present on create and update. Optional fields read as `null` or missing. */
  required?: boolean;
  /** Functions that run for this field on every write and read. Field hooks run before the collection's or global's hooks. */
  hooks?: FieldHooks<V>;
  /**
   * The value on `create` when the input leaves the field `undefined` (not `null`). Applied before `beforeValidate` hooks.
   * Not applied on `update`. Inside a group, only when the group is sent.
   * A plain value also pre-fills new documents in the admin. A function runs on the server only.
   */
  default?: S | Fn<HookArgs, S | null | undefined>;
  /**
   * Server only. Returns `true`, or an error message for this field. Runs after the type checks and before `beforeChange` hooks.
   * All messages of a write come back together in one `ValidationError`. Skipped when `condition` is false.
   */
  validate?: Validate<S>;
  /**
   * No other document of the collection MAY have the same value. Checked after `beforeChange` hooks; a collision is a
   * `ValidationError` with `Already used`. `null` and missing values never collide. Case-sensitive.
   * Only on top-level `text`, `textarea`, `number`, `date`, `select`, `slug` and single `relation` fields of a collection.
   */
  unique?: boolean;
  /**
   * Admin only: the input is shown disabled. The local API, HTTP and hooks can still write the value, and input is not stripped.
   * A hook that owns the value MUST overwrite it. On a group, it disables all fields inside. Default `false`.
   */
  readOnly?: boolean;
};
