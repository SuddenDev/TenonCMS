// Files in `templates/` MUST import only from each other. Browser code may bundle them.

/** A `{dot.path}` placeholder. Global, so it is used with `matchAll` and `replace` only. */
export const PLACEHOLDER = /\{([^{}]+)\}/g;

/** The dot paths of a template, in order: `'/{category.slug}/{slug}'` gives `['category.slug', 'slug']`. */
export const placeholders = (template: string) =>
  [...template.matchAll(PLACEHOLDER)].map((m) => m[1]!);
