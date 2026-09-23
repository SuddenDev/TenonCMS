<script setup lang="ts">
import { onMounted, onUnmounted, useTemplateRef, watch } from 'vue'
import type { Mount } from '../../../core/src/admin/index.d.ts'

const props = defineProps<{ mount: Mount<any>; ctx: Record<string, unknown> }>()
const el = useTemplateRef('el')
let handle: { update?: (ctx: unknown) => void; unmount: () => void } | undefined

onMounted(() => {
  const r = props.mount(el.value!, props.ctx)
  handle = typeof r === 'function' ? { unmount: r } : r
})
watch(() => props.ctx, (ctx) => handle?.update?.(ctx), { deep: true })
onUnmounted(() => handle?.unmount())
</script>

<template>
  <div ref="el" />
</template>
