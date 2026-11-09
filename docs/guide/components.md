# Vue components

`tenoncms/vue` has unstyled components for rendering content in Vue. Nuxt auto-imports them with a `Tenon` prefix: `TenonLink`, `TenonBlocks` and `TenonRichtext`.

They work like [reka-ui](https://reka-ui.com) primitives. They render one element and add no styles or classes. Attributes like `class` go on that element.

- `as` sets the element or component. The default is `div`, or `a` for `Link`.
- `asChild` renders no element of its own. Its props and attributes go into the only element of the default slot. Classes, styles and listeners merge.

```vue
<Richtext :content="post.body" as="article" class="prose" />

<Link :link="page.cta" as-child>
  <button class="button">Read more</button>
</Link>
```

## Link

`Link` renders a populated [`link` field](./schema.md). The default slot is the content. Without a slot, it shows the target's title.

```vue
<script setup lang="ts">
import { Link } from "tenoncms/vue";
import { RouterLink } from "vue-router";
</script>

<template>
  <Link :link="page.cta" :as="RouterLink" class="button" />
</template>
```

- It renders nothing for an empty or broken link (a deleted target).
- A component in `as`, like `RouterLink`, gets internal paths (`/about`) as `to`, so they navigate client-side. Other URLs (`https://…`, `mailto:`) render a plain `<a>`.
- `target="_blank"` adds `rel="noopener noreferrer"`.
- In Nuxt, `TenonLink` uses `NuxtLink` as `as`, so internal links prefetch.

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

With `edit`, the blocks can bind their fields for click-to-edit in the [live preview](./live-preview.md). `useBlockEdit(block)` returns the `data-cms` value of a path inside the block:

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

- `edit` names the document and the blocks field: `id` is `null` for a global. A field inside a group is a dot path, like `path: 'layout.content'`.
- `edit()` without a path binds the whole block.
- Without the `edit` prop, or outside `Blocks`, `edit()` returns `undefined` and binds nothing.

## Rich text

`Richtext` renders a `richtext` field. See [Rich text](./richtext.md#render-on-the-site).

## SEO in Nuxt

`useTenonSeo(page)` fills the head from a document. See [Pages and SEO](./pages-and-seo.md#in-nuxt).
