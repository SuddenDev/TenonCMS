<script setup lang="ts">
const props = defineProps<{ block: { id: string; body?: string | null } }>();
const edit = useBlockEdit(props.block);
</script>

<template>
  <p :data-cms="edit('body')" style="white-space: pre-wrap">{{ block.body }}</p>
</template>
