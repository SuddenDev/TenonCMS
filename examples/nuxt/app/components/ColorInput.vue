<script setup lang="ts">
defineProps<{ value: string | null }>();
defineEmits<{ change: [value: string] }>();
</script>

<template>
  <input
    :value="value ?? '#000000'"
    type="color"
    @input="$emit('change', ($event.target as HTMLInputElement).value)"
  />
</template>
