<script setup lang="ts">
import options from '#integral/admin'
import { mountAdmin } from 'integral-cms/admin'
import { onMounted, onUnmounted, useTemplateRef } from 'vue'

const el = useTemplateRef('el')
let unmount: () => void
onMounted(() => (unmount = mountAdmin(el.value!, options)))
onUnmounted(() => unmount())
</script>

<template>
  <div ref="el" />
</template>
