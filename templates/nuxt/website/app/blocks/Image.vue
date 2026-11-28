<script setup lang="ts">
import type { PropType } from "vue";
import type { BlockProps } from "./types";

const props = defineProps({
  block: { type: Object as PropType<BlockProps<"image">["block"]>, required: true },
});
const edit = useBlockEdit(props.block);
</script>

<template>
  <figure class="wrap figure">
    <TenonImage
      :image="block.image"
      sizes="(min-width: 1200px) 1120px, 100vw"
      :data-cms="edit('image')"
    />
    <figcaption v-if="block.caption" :data-cms="edit('caption')">{{ block.caption }}</figcaption>
  </figure>
</template>
