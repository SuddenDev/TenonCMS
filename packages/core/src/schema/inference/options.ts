import type { Fields } from "../fields/index.ts";
import type { FieldsOf, Keys } from "./common.ts";
import type { Next, Off, Sub, Wide } from "./read.ts";

/** The populate spec of `Options`: `populate: false`, a populate object, `depth`, or the default depth. */
export type PopulateOf<Options, DefaultDepth extends number> = Options extends {
  populate: false;
}
  ? false
  : Options extends { populate: infer Spec extends object }
    ? Spec
    : Options extends { depth: infer Depth extends number }
      ? Depth
      : DefaultDepth;

/** The select spec of `Options`. `true` selects everything. */
export type SelectOf<Options> = Options extends { select: infer Spec extends object } ? Spec : true;

/** Paths a `populate` object may name: groups, relations and joins, nested along their targets. Images and files are leaves. */
type PopulateField<Collections, FieldType> = FieldType extends {
  type: "group";
  fields: infer Group extends Fields;
}
  ? true | Populate<Collections, Group>
  : FieldType extends { collection: infer Collection }
    ? true | Populate<Collections, FieldsOf<Collections, Collection>>
    : true;

/** The keys a `populate` object may name at each level. */
export type Populate<Collections, F extends Fields> = {
  [K in Keys<F, { type: "group" | "relation" | "join" | "image" | "file" }>]?: PopulateField<
    Collections,
    F[K]
  >;
};

/** {@link Populate}, or a plain record for an untyped schema. */
export type PopulateArg<Collections, F extends Fields> =
  Wide<Collections> extends true ? Record<string, unknown> : Populate<Collections, F>;

type SelectGroup<Collections, Group extends Fields, Spec> =
  | true
  | Select<Collections, Group, Spec extends true ? 1 : Spec, false>;
type SelectRelation<Collections, Collection, Spec> =
  Off<Spec> extends true
    ? true
    : true | Select<Collections, FieldsOf<Collections, Collection>, Next<Spec>>;
type SelectJoin<Collections, Collection, PopulateSpec, Key, Spec> = PopulateSpec extends object
  ? Key extends keyof PopulateSpec
    ? true | Select<Collections, FieldsOf<Collections, Collection>, Next<Spec>>
    : true
  : number extends PopulateSpec
    ? true | Select<Collections, FieldsOf<Collections, Collection>, Next<Spec>>
    : true;

type SelectField<Collections, FieldType, PopulateSpec, Key> = FieldType extends {
  type: "group";
  fields: infer Group extends Fields;
}
  ? SelectGroup<Collections, Group, Sub<PopulateSpec, Key>>
  : FieldType extends { type: "relation"; collection: infer Collection }
    ? SelectRelation<Collections, Collection, Sub<PopulateSpec, Key>>
    : FieldType extends { type: "join"; collection: infer Collection }
      ? SelectJoin<Collections, Collection, PopulateSpec, Key, Sub<PopulateSpec, Key>>
      : true;

/**
 * Keys a `select` object may name: fields, and on a document the meta keys.
 * Nested keys are allowed under groups and populated relations or joins.
 */
export type Select<
  Collections,
  F extends Fields,
  PopulateSpec,
  Document extends boolean = true,
  L extends string = string,
> = {
  [K in keyof F]?: SelectField<Collections, F[K], PopulateSpec, K>;
} & (Document extends true
  ? { id?: true; createdAt?: true; updatedAt?: true; publishedAt?: true; hasDraft?: true } & ([
      L,
    ] extends [never]
      ? {}
      : { locale?: true; locales?: true; sharedDraft?: true; alternates?: true })
  : {});

/** {@link Select}, or a plain record for an untyped schema. */
export type SelectArg<
  Collections,
  F extends Fields,
  PopulateSpec,
  Document extends boolean = true,
  L extends string = string,
> =
  Wide<Collections> extends true
    ? Record<string, any>
    : Select<Collections, F, PopulateSpec, Document, L>;

/**
 * `Provided` with every key that `Allowed` lacks mapped to `never`, at every level. Generic inference skips excess
 * property checks, so this rejects them. An object under a key that allows only `true` maps to `never`; without that rule
 * `keyof never` accepts every key.
 */
export type Exact<Provided, Allowed> = Provided extends object
  ? [Allowed] extends [never]
    ? never
    : {
        [K in keyof Provided]: K extends keyof Allowed
          ? Exact<Provided[K], Exclude<Allowed[K], true | undefined>>
          : never;
      }
  : Provided;

/**
 * Read options of `find`, `findOne`, `findById` and `getGlobal`. Globals have no `id`, `createdAt` or `updatedAt`.
 * `L` is the instance's locale union, `never` without `localization`.
 */
export type ReadOptions<
  Collections,
  F extends Fields,
  Document extends boolean = true,
  L extends string = string,
> = {
  /** `false` returns ids. An object resolves only the listed paths, `true` one hop. Default: every relation up to `depth`. */
  populate?: boolean | PopulateArg<Collections, F>;
  /** Hops resolved when `populate` is not an object. */
  depth?: number;
  /**
   * The fields a read returns. `id` always comes back; the other meta keys only when listed. `true` keeps a value as
   * `populate` leaves it: an id, ids, a document or documents. An object lists the keys inside a group, or inside a relation or
   * join that `populate` resolves. `{}` returns only `id`. Hooks see the full documents; `afterOperation` sees the result.
   * Default: every field.
   */
  select?: SelectArg<Collections, F, number, Document, L>;
  /** The locale to read. Default: the default locale. Collections and globals that are not `localized` ignore it. Without `localization`, the type is `never`. */
  locale?: L;
  /** Whether a missing value or locale reads as the default locale's. Default: `localization.fallback`. */
  fallback?: boolean;
  /** Adds `alternates` to documents of localized collections with a `permalink`: the URL of each published locale, and `"x-default"`. Costs one read per locale. */
  alternates?: boolean;
};

/** Checks the `populate` and `select` literals at every level. */
export type Checked<
  Options extends ReadOptions<Collections, F, Document, L>,
  Collections,
  F extends Fields,
  DefaultDepth extends number = 2,
  Document extends boolean = true,
  L extends string = string,
> = Options & {
  populate?: Exact<Options["populate"], PopulateArg<Collections, F>>;
  select?: Exact<
    Options["select"],
    SelectArg<Collections, F, PopulateOf<Options, DefaultDepth>, Document, L>
  >;
};
