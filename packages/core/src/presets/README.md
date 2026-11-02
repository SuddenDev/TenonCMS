# presets

`tenoncms/presets`: plain field objects and named hooks that a host spreads into its own collections. Each file is meant to be read as documentation of what you get.

Every preset is a function, even without options. Each call returns fresh objects, and an option can come later without breaking hosts.

| File              | What it gives you                                                                                                                                                                                                                                     |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `page.ts`         | `page(options)`: fields for pages with nested URLs (title, slug, parent, path), the `nestedPaths()` hooks and `permalink: "{path}"`. `options.collection` is where `parent` points.                                                                   |
| `menu.ts`         | `menu(options)`: the blocks `menuLink` and `menuHeading`, a tree `items` field for a menu global, `options.depth` (`0` flat by default, `-1` unlimited and shared) and `options.blocks` of the host wherever a link goes. Read it with `menuItems()`. |
| `seo.ts`          | `seo()`: one optional group with title, description, image and noindex.                                                                                                                                                                               |
| `settings.ts`     | `settings()`: the `general` and `seo` globals that `defineCms()` adds as site settings.                                                                                                                                                               |
| `nested-paths.ts` | `nestedPaths()`: hooks that store `path` from the parent chain and update children when it changes. In a locale, children without a row in it are skipped.                                                                                            |
| `strings.ts`      | `strings(defaults)`: a localized settings global with one text field per key, labeled with `label` or the key. A read returns the stored text, else the code default of its locale.                                                                   |

They import only `errors.ts`, `slugify.ts` and types. No zod gets in, so presets are safe in browser bundles.
