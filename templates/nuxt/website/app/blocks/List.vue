<script setup lang="ts">
import type { PropType } from "vue";
import type { BlockProps } from "./types";

const props = defineProps({
  block: { type: Object as PropType<BlockProps<"list">["block"]>, required: true },
});
const edit = useBlockEdit(props.block);
</script>

<template>
  <section class="wrap split">
    <div class="split-head">
      <h2 :data-cms="edit('title')">{{ block.title }}</h2>
      <p v-if="block.intro" :data-cms="edit('intro')">{{ block.intro }}</p>
    </div>
    <ul class="rows">
      <li v-for="(item, i) in block.items" :key="item.id">
        <strong :data-cms="edit(`items.${i}.title`)">{{ item.title }}</strong>
        <span :data-cms="edit(`items.${i}.text`)">{{ item.text }}</span>
        <code :data-cms="edit(`items.${i}.note`)">{{ item.note }}</code>
      </li>
    </ul>
  </section>
</template>
