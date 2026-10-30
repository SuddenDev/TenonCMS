import type {
  AlternatesOf,
  Fields,
  Locale,
  LocaleMeta,
  PopulateOf,
  ReadDoc,
  Schema,
  SelectOf,
} from "../../schema/index.ts";
import type { Replace } from "../../schema/inference/common.ts";
import type { Register } from "../index.ts";

// Fields as the HTTP API sends them: private fields optional, inside groups, array items and block items too.
// Untyped fields (the admin's) stay as they are. The recursion would not terminate.
type HttpFields<F> = string extends keyof F ? F : { [K in keyof F]: HttpField<F[K]> };

type HttpField<F> = F extends { private: true } ? Omit<HttpGroup<F>, "required"> : HttpGroup<F>;

type HttpGroup<F> = F extends { type: "group" | "array"; fields: infer G }
  ? Replace<F, "fields", HttpFields<G>>
  : F extends { type: "blocks"; blocks: infer B }
    ? Replace<F, "blocks", { [K in keyof B]: Replace<B[K], "fields", HttpBlockFields<B[K]>> }>
    : F;

type HttpBlockFields<B> = B extends { fields: infer G } ? HttpFields<G> : never;

// `Extract` keeps the result assignable to `Fields`.
type Http<R> = string extends keyof R
  ? R
  : {
      [K in keyof R]: Omit<R[K], "fields"> & {
        fields: R[K] extends { fields: infer F } ? Extract<HttpFields<F>, Fields> : never;
      };
    };

/** The collections of `C` as the HTTP API sends them: `private` fields are optional. Use them to type browser code; the client's read types build on them. */
export type Collections<C extends { schema: Schema }> = Http<
  NonNullable<C["schema"]["collections"]>
>;

/** The globals of `C` as the HTTP API sends them: `private` fields are optional. */
export type Globals<C extends { schema: Schema }> = Http<NonNullable<C["schema"]["globals"]>>;

/** The registered `cms` type, or an untyped schema without a registration. */
export type RegisteredCms = Register extends { cms: infer C extends { schema: Schema } }
  ? C
  : { schema: Schema };

export type CollectionFields<
  C extends { schema: Schema },
  K extends keyof Collections<C>,
> = Collections<C>[K]["fields"];

export type GlobalFields<
  C extends { schema: Schema },
  K extends keyof Globals<C>,
> = Globals<C>[K]["fields"];

export type Depth<C> = C extends { populate: { depth: infer D extends number } } ? D : 2;

export type ReadCollection<
  C extends { schema: Schema },
  K extends keyof Collections<C>,
  O,
> = ReadDoc<
  Collections<C>,
  CollectionFields<C, K>,
  PopulateOf<O, Depth<C>>,
  SelectOf<O>,
  LocaleMeta<Collections<C>[K], Locale<C>, SelectOf<O>, AlternatesOf<O>>
>;
