# Tenon docs

The documentation site, built with [Docus](https://docus.dev) (Nuxt Content and Nuxt UI).

```sh
pnpm dev:docs
pnpm build:docs
```

## Structure

Pages live in `content/docs/` and are served under `/docs`. The landing page is `app/pages/index.vue`.

The three top folders are sections. The header links them, and the sidebar shows the pages of the current one (`navigation.sub` in `app/app.config.ts`).

| Section | Folder    | Holds                                                                |
| ------- | --------- | -------------------------------------------------------------------- |
| Docs    | `1.core`  | What Tenon does, feature by feature, and the reference               |
| Guide   | `2.guide` | Step by step: frameworks, deployment, databases and storage, recipes |
| CLI     | `3.cli`   | `create-tenoncms` and every `tenon` command                          |

- The number prefix sets the order. The sidebar sorts as text, so a folder with more than nine entries needs two digits (`01.`).
- Every folder has a `.navigation.yml` with `title` and `icon: false`. Pages set no icon.
- The reference lists every option, field type, method and route. Other pages teach one task and link to it; they do not repeat its tables.

## Writing rules

- The reader is a developer who adds Tenon to a site. Explain what to do and what happens, not how core does it.
- Present tense, short sentences, simple words. One idea per paragraph.
- Start a page with one sentence on what the reader gets, then the smallest working example.
- Every framework is equal. Code that differs per framework shows all of them, in the order Astro, Nuxt, TanStack Start.
- Each code block has a file name and runs as shown.

## Components

Docus registers the Nuxt UI prose components. A page uses them where they help, not for decoration.

| Need                              | Component                                   |
| --------------------------------- | ------------------------------------------- |
| The same code per framework       | `::code-group{sync="framework"}`            |
| Install commands                  | `::code-group{sync="pm"}`                   |
| Prose that differs per framework  | `::tabs{sync="framework"}`                  |
| A project or package layout       | `::code-tree`                               |
| A setup in order                  | `::steps`                                   |
| Options, props and flags          | `::field-group` with `::field`              |
| A hint, a limit, a data-loss risk | `::note`, `::tip`, `::warning`, `::caution` |
| Links to the next pages           | `::card-group` with `::card`                |
| Long optional detail              | `::accordion`, `::collapsible`              |

`sync` keeps the reader's framework and package manager across pages.

## Outline bullets

A page that is not written yet holds its headlines and a few bullets on what belongs there. A bullet that starts with `UI:` names the component for that section. Both go when the page is written.

## Docus skill

```sh
npx skills add nuxt-content/docus
```

It teaches an AI assistant the MDC syntax and the Docus components.
