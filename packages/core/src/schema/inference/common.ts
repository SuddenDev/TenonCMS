import type { Fields } from "../fields/index.ts";

/** `T` with its intersections flattened, so editors show one object. */
export type Simplify<T> = { [K in keyof T]: T[K] } & {};

/** `T` with property `K` replaced by `V`. */
export type Replace<T, K extends PropertyKey, V> = { [P in keyof T]: P extends K ? V : T[P] };

/** The keys of `F` whose field matches `Match`. */
export type Keys<F, Match> = { [K in keyof F]: F[K] extends Match ? K : never }[keyof F];

/** The fields of collection `C` in `Cs`. `never` for an unknown collection. */
export type FieldsOf<Cs, C> = C extends keyof Cs
  ? Cs[C] extends { fields: infer F extends Fields }
    ? F
    : never
  : never;
