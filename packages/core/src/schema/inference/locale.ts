/**
 * The locale codes of instance `C`: the union of its `localization.locales`. `never` without `localization`, so a
 * `locale` option cannot be set. An untyped instance (the admin's) allows any string.
 */
export type Locale<C> = C extends {
  localization?: { locales: readonly (infer L extends string)[] };
}
  ? L
  : string;

/** The `alternates` option of `Options` as a boolean. */
export type AlternatesOf<Options> = Options extends { alternates: true } ? true : false;

/** Present on entries with a localized group, array or blocks field. */
type SyncKeys = {
  /** Whether the document uses one item structure in every locale. */
  syncStructure?: boolean;
  /** Whether the document follows the entry's default instead of its own state. */
  syncStructureDefault?: boolean;
};

type LocaleKeys<L extends string, Alternates extends boolean> = {
  locale: L;
  locales: L[];
  /** Whether the shared fields have a pending draft that differs from the published ones. */
  sharedDraft: boolean;
} & SyncKeys &
  (Alternates extends true ? { alternates: Partial<Record<L | "x-default", string>> } : {});

/** The locale metadata a `select` spec keeps. Like the other metadata keys, only listed ones are returned. */
type PickedLocaleKeys<Keys, SelectSpec> = [SelectSpec] extends [true]
  ? Keys
  : Pick<Keys, Extract<keyof SelectSpec, keyof Keys>>;

/**
 * `locale`, `locales`, `sharedDraft` and, with the `alternates` option, `alternates` on a document of a localized collection.
 * Nothing for other collections or without locales.
 */
export type LocaleMeta<Entry, L extends string, SelectSpec, Alternates extends boolean> = [
  L,
] extends [never]
  ? {}
  : Entry extends { localized: true }
    ? PickedLocaleKeys<LocaleKeys<L, Alternates>, SelectSpec>
    : {};

/** `locale`, `locales` and `sharedDraft` on a localized global. A `select` leaves them out, like the rest of a global's meta. */
export type GlobalLocaleMeta<Entry, L extends string, SelectSpec> = [L] extends [never]
  ? {}
  : Entry extends { localized: true }
    ? [SelectSpec] extends [true]
      ? { locale: L; locales: L[]; sharedDraft: boolean } & SyncKeys
      : {}
    : {};
