// This file MUST have no imports. Browser code may bundle it.

const PLACEHOLDER = /\{([^{}]+)\}/g;

/** The dot paths of a template, in order: `'/{category.slug}/{slug}'` gives `['category.slug', 'slug']`. */
export const placeholders = (template: string) =>
  [...template.matchAll(PLACEHOLDER)].map((m) => m[1]!);
