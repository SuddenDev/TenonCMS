# Guides

How to use tenoncms in your project. Each page starts with the idea, then shows examples.

New here? Follow [Your first site](first-site.md), or read [Framework setup](frameworks.md) and [Schema and fields](schema.md) first, then pick what you need.

Building or changing tenoncms itself? See the [developer docs](../dev/README.md).

**Get started**

| Guide                            | What it covers                                  |
| -------------------------------- | ----------------------------------------------- |
| [Your first site](first-site.md) | Step by step from empty project to deploy       |
| [Framework setup](frameworks.md) | Astro, Nuxt, TanStack Start, any Vite host      |
| [Schema and fields](schema.md)   | Field types, options, validation, conditions    |
| [The CLI](cli.md)                | `npm create tenoncms`, backup, restore, upgrade |

**Model your content**

| Guide                                   | What it covers                                 |
| --------------------------------------- | ---------------------------------------------- |
| [Relations](relations.md)               | `relation`, `join`, `populate`, `onDelete`     |
| [Lists and blocks](lists-and-blocks.md) | `array` and `blocks` fields                    |
| [Rich text](richtext.md)                | `richtext` fields, links, rendering components |
| [Media](media.md)                       | Uploads, storage, responsive images            |

**Work with content**

| Guide                             | What it covers                                          |
| --------------------------------- | ------------------------------------------------------- |
| [Reading and writing](reading.md) | `find`, filters, `select`, `update`, the browser client |
| [Hooks](hooks.md)                 | Stages, order, errors, transactions                     |
| [Drafts](drafts.md)               | Draft, publish and discard                              |
| [Localization](localization.md)   | Locales, fallback, `hreflang`, site strings             |

**Build the site**

| Guide                                    | What it covers                                                  |
| ---------------------------------------- | --------------------------------------------------------------- |
| [Pages and SEO](pages-and-seo.md)        | Nested page paths, `seoMeta()`, sitemap, `robots.txt`, settings |
| [Components](components.md)              | `Image`, `Picture`, `Link`, `Blocks`, `Richtext` and `Seo`      |
| [Verification and tracking](tracking.md) | Search Console codes, Google Tag Manager, consent               |
| [Menus](menus.md)                        | The `menu` preset, the tree editor, `menuItems()`               |
| [Live preview](live-preview.md)          | `permalink`, `edit()`, the visual editor, the admin bar         |

**Run it**

| Guide                                        | What it covers                                              |
| -------------------------------------------- | ----------------------------------------------------------- |
| [Auth, users and access](auth-and-access.md) | better-auth options, roles, invites, API keys, access rules |
| [Email](email.md)                            | SMTP and custom adapters, templates                         |
| [Jobs](jobs.md)                              | Tasks, the queue, the clock route, access, retries          |
| [Webhooks](webhooks.md)                      | Outgoing webhooks, payloads, signatures, deploy hooks       |
| [Lifecycle hooks](lifecycle.md)              | `seed`, `onInit`, `afterImport`, `afterError`               |
| [Backup and restore](backup.md)              | `cms.export()`, `cms.import()`, the Backup page             |
| [Customize the admin](admin.md)              | Branding, custom fields and pages                           |
| [Plugins](plugins.md)                        | Using, writing and publishing plugins                       |
