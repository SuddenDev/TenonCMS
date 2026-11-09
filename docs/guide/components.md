# Components

Unstyled components that render content on your site, for Vue, React and Astro:

| Component  | Renders                     | Vue (`tenoncms/vue`)   | React (`tenoncms/react`) | Astro (`tenoncms/astro/components`) |
| ---------- | --------------------------- | ---------------------- | ------------------------ | ----------------------------------- |
| `Image`    | an `image` field as `<img>` | yes                    | yes                      | yes                                 |
| `Picture`  | images per media query      | yes                    | yes                      | yes                                 |
| `Link`     | a `link` field              | yes                    | yes                      | yes, a plain `<a>`                  |
| `Blocks`   | a `blocks` field            | yes                    | yes                      | yes                                 |
| `Richtext` | a `richtext` field          | yes                    | yes                      | yes                                 |
| `Seo`      | the page's `<head>` tags    | `useTenonSeo()` (Nuxt) | yes, React 19            | yes                                 |

Nuxt auto-imports the Vue components with a `Tenon` prefix: `TenonImage`, `TenonPicture`, `TenonLink`, `TenonBlocks` and `TenonRichtext`.

Each component (except `Picture` and `Seo`) renders one element and adds no styles or classes. Attributes like `class` go on that element.

- `as` sets the element or component. The default is `div`, or `a` for `Link`.
- `asChild` renders no element of its own. Its props and attributes go into the only element of the default slot (Vue) or of `children` (React). Classes, styles and listeners merge. Astro has no `asChild`.

```vue
<Richtext :content="post.body" as="article" class="prose" />

<Link :link="page.cta" as-child>
  <button class="button">Read more</button>
</Link>
```

## Image

`Image` renders a populated [`image` field](./media.md#image-and-file-fields) as an `<img>` with its `src`, `srcset`, `width`, `height` and `alt`.

```vue
<Image :image="post.hero" sizes="(min-width: 720px) 720px, 100vw" />
```

```tsx
import { Image } from "tenoncms/react";

<Image image={post.hero} sizes="(min-width: 720px) 720px, 100vw" />;
```

```astro
---
import { Image } from "tenoncms/astro/components";
---

<Image image={post.hero} sizes="(min-width: 720px) 720px, 100vw" />
```

- Pass `sizes`: the width the image renders at. Without it, the browser assumes the full viewport width and may load a larger file than needed.
- It loads lazily (`loading="lazy"`, `decoding="async"`). For the main image of a page, pass `loading="eager"` and `fetchpriority="high"`.
- `alt` comes from the media library. An `alt` attribute overrides it. Without either, `alt` is empty.
- With a `data-cms` attribute, it adds `data-cms-attr="src,srcset,alt"`, so the [live preview](./live-preview.md) swaps the image as you edit.
- It renders nothing for an empty field.
- In Astro, import it under another name if you also use `astro:assets`: `import { Image as CmsImage } from "tenoncms/astro/components"`.

## Picture

`Picture` shows another image where a media query matches, like a tall crop on phones. It renders a `<picture>` with a `<source>` per entry of `sources`, then the `<img>` of `image`.

```vue
<Picture
  :image="page.hero"
  :sources="[{ media: '(max-width: 600px)', image: page.heroMobile }]"
  sizes="100vw"
/>
```

- Each source takes `image`, `media`, and optionally `sizes` and `type`. `sizes` defaults to the `<img>`'s.
- A source has the `width` and `height` of its image, so the browser keeps the right aspect ratio per media query.
- A source without an image is left out. Without `image`, `Picture` renders nothing.
- Attributes go on the `<img>`, as with `Image`: `alt`, `loading`, `class` and `data-cms`. The live preview only swaps the `<img>`, not the sources.
- Images come in one format (`images.format`), so there is no `<source type>` per format. Every browser in use shows WebP.

## Link

`Link` renders a populated [`link` field](./schema.md). The default slot (Vue, Astro) or `children` (React) is the content. Without one, it shows the target's title.

```vue
<script setup lang="ts">
import { Link } from "tenoncms/vue";
import { RouterLink } from "vue-router";
</script>

<template>
  <Link :link="page.cta" :as="RouterLink" class="button" />
</template>
```

```tsx
import { Link as RouterLink } from "@tanstack/react-router";
import { Link } from "tenoncms/react";

<Link link={page.cta} as={RouterLink} className="button" />;
```

- It renders nothing for an empty or broken link (a deleted target).
- A component in `as`, like `RouterLink`, gets internal paths (`/about`) as `to`, so they navigate client-side. Other URLs (`https://…`, `mailto:`) render a plain `<a>`.
- `target="_blank"` adds `rel="noopener noreferrer"`.
- In Nuxt, `TenonLink` uses `NuxtLink` as `as`, so internal links prefetch.
- In Astro, `Link` always renders an `<a>`.

## Blocks

`Blocks` renders a `blocks` field. It picks the component of each block's `blockType` and passes the block as the `block` prop. A block type without a component renders nothing.

```vue
<script setup lang="ts">
import { Blocks } from "tenoncms/vue";
import Hero from "./blocks/Hero.vue";
import Text from "./blocks/Text.vue";
</script>

<template>
  <Blocks
    :blocks="page.content"
    :components="{ hero: Hero, text: Text }"
    :edit="{ collection: 'pages', id: page.id, path: 'content' }"
  />
</template>
```

With `edit`, the blocks can bind their fields for click-to-edit in the [live preview](./live-preview.md). In Vue, `useBlockEdit(block)` returns the `data-cms` value of a path inside the block:

```vue
<!-- blocks/Hero.vue -->
<script setup lang="ts">
import { useBlockEdit } from "tenoncms/vue"; // auto-imported in Nuxt

const props = defineProps<{ block: { id: string; title: string } }>();
const edit = useBlockEdit(props.block);
</script>

<template>
  <h2 :data-cms="edit('title')">{{ block.title }}</h2>
</template>
```

In React and Astro, each block component gets the same function as the `edit` prop:

```tsx
import type { BlockProps } from "tenoncms/react";

export function Hero({ block, edit }: BlockProps<{ title: string }>) {
  return <h2 data-cms={edit("title")}>{block.title}</h2>;
}
```

```astro
---
// blocks/Hero.astro
const { block, edit } = Astro.props;
---

<h2 data-cms={edit("title")}>{block.title}</h2>
```

- `edit` names the document and the blocks field: `id` is `null` for a global. A field inside a group is a dot path, like `path: 'layout.content'`.
- `edit()` without a path binds the whole block.
- Without the `edit` prop, or outside `Blocks`, `edit()` returns `undefined` and binds nothing.
- The React components use no hooks or context, so they also work as server components.

## Rich text

`Richtext` renders a `richtext` field. See [Rich text](./richtext.md#render-on-the-site).

## Your own components

`tenoncms/components` has the helpers the components use, for other frameworks or your own markup:

- `imageAttrs(image, attrs?)`: the `<img>` attributes, or `undefined` for an empty field.
- `pictureAttrs(image, sources?, attrs?)`: `{ sources, img }` for a `<picture>`.
- `linkAttrs(link, router?)`: `href` (or `to` with `router`), `target` and `rel`, or `undefined` for a broken link.
- `editBlock(edit, blocks, block, path?)`: the `data-cms` value of a field inside a block.

```svelte
<script>
  import { imageAttrs } from "tenoncms/components";
  let { post } = $props();
</script>

{#if post.hero}<img {...imageAttrs(post.hero, { sizes: "100vw" })} />{/if}
```

## Seo

`Seo` puts a page's title, description, Open Graph, `robots`, canonical, `hreflang` and verification tags into `<head>`. See [Pages and SEO](./pages-and-seo.md#seo-tags).

```astro
---
import { Seo } from "tenoncms/astro/components";
---

<head>
  <Seo page={page} />
</head>
```

```tsx
import { Seo } from "tenoncms/react";

<Seo page={page} general={general} seo={seo} />;
```

- In Astro, `Seo` reads the `general` and `seo` settings in the request's locale. Pass them as props if you have read them already.
- In React, pass the settings. React 19 moves the tags into `<head>` from anywhere in the tree. With TanStack Router, use `seoHead()` in `head()` instead.
- In Nuxt, use `useTenonSeo(page)`.
