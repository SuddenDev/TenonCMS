<script setup lang="ts">
import type { PropType } from "vue";
import type { BlockProps } from "./types";

const props = defineProps({
  block: { type: Object as PropType<BlockProps<"hero">["block"]>, required: true },
});
const edit = useBlockEdit(props.block);
</script>

<template>
  <section class="wrap hero">
    <h1 :data-cms="edit('title')">{{ block.title }}</h1>
    <p v-if="block.intro" class="intro" :data-cms="edit('intro')">{{ block.intro }}</p>
    <div v-if="block.links?.length" class="actions">
      <!-- A plain <a>: a link like /admin is no page of this app. -->
      <TenonLink
        v-for="(item, i) in block.links"
        :key="item.id"
        as="a"
        :link="item.link"
        :class="{ button: i === 0 }"
        :data-cms="edit(`links.${i}.label`)"
      >
        {{ item.label || item.link?.title }}
      </TenonLink>
    </div>
  </section>
</template>
