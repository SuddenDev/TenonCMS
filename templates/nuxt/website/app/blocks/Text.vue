<script setup lang="ts">
import type { PropType } from "vue";
import type { BlockProps } from "./types";

const props = defineProps({
  block: { type: Object as PropType<BlockProps<"text">["block"]>, required: true },
});
const edit = useBlockEdit(props.block);
</script>

<template>
  <section class="wrap">
    <div class="split text">
      <h2 :data-cms="edit('title')">{{ block.title }}</h2>
      <TenonRichtext :content="block.body" class="prose" :data-cms="edit('body')" />
    </div>
  </section>
</template>
