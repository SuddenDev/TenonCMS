import type { Replace } from "./common.ts";

/** Fields `F` as `linkBlocks()` leaves them: each block name in a `blocks` field is the shared block `B[name]`. */
export type Linked<F, B> = {
  [K in keyof F]: F[K] extends { type: "group" | "array"; fields: infer G }
    ? Replace<F[K], "fields", Linked<G, B>>
    : F[K] extends { type: "blocks"; blocks: infer R }
      ? Replace<F[K], "blocks", LinkedBlocks<R, B>>
      : F[K];
};

// A list of names becomes a record with the names as keys.
type LinkedBlocks<R, B> = R extends readonly (infer N extends string)[]
  ? { [K in N]: LinkedBlock<K extends keyof B ? B[K] : K, B> }
  : { [N in keyof R]: LinkedBlock<R[N] extends keyof B ? B[R[N]] : R[N], B> };

type LinkedBlock<X, B> = X extends { fields: infer G } ? Replace<X, "fields", Linked<G, B>> : X;

/** Collections or globals `O` with their fields linked to the shared blocks `B`. Without shared blocks, `O` stays. */
export type LinkedOwners<O, B> = [keyof B] extends [never]
  ? O
  : {
      [N in keyof O]: O[N] extends { fields: infer F }
        ? Replace<O[N], "fields", Linked<F, B>>
        : O[N];
    };
