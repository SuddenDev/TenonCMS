# presets

`tenoncms/presets`: plain field objects and named hooks that a host spreads into its own collections. Each file is meant to be read as documentation of what you get.

The `…Preset()` functions wrap them as whole entries for `defineCms({ presets })`: `{ collections?, globals?, blocks? }`, the `Preset` type. [merge-presets.ts](../cms/config/merge-presets.ts) merges them into the host's schema.

Every preset is a function, even without options. Each call returns fresh objects, and an option can come later without breaking hosts.

| File              | What it gives you                                                                                                                                                                                                                                                                                               |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `page.ts`         | `page(options)`: fields for pages with nested URLs (title, slug, parent, path), the `nestedPaths()` hooks and `permalink: "{path}"`. `options.collection` is where `parent` points. `pagesPreset(options)`: the whole collection, optionally with `seo()`.                                                      |
| `menu.ts`         | `menu(options)`: the blocks `menuLink` and `menuHeading`, a tree `items` field for a menu global, `options.depth` (`0` flat by default, `-1` unlimited and shared) and `options.blocks` of the host wherever a link goes. Read it with `menuItems()`. `menuPreset(options)`: a settings global with its blocks. |
| `seo.ts`          | `seo(templates?)`: one optional group with title, description, image and noindex, and `editor: "seo"` for the admin's SEO editor. `templates` are the collection's title and description templates. Title and description are templates for `seoMeta()`.                                                        |
| `settings.ts`     | `settings()`: the `general` and `seo` globals that `defineCms()` adds as site settings. `seo` holds the default title and description templates.                                                                                                                                                                |
| `nested-paths.ts` | `nestedPaths()`: hooks that store `path` from the parent chain and update children when it changes. In a locale, children without a row in it are skipped.                                                                                                                                                      |
| `strings.ts`      | `strings(defaults)`: a localized settings global with one text field per key, labeled with `label` or the key. A read returns the stored text, else the code default of its locale. `stringsPreset(entries)`: the same as a preset.                                                                             |

They import only `errors.ts`, `slugify.ts` and types. No zod gets in, so presets are safe in browser bundles.
