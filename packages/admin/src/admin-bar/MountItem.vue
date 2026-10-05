<script setup lang="ts">
import { onMounted, onUnmounted, useTemplateRef, watch } from "vue";
import type { AdminBarContext, Mount, MountHandle } from "../../../core/src/admin/index.d.ts";

const props = defineProps<{ mount: Mount<AdminBarContext>; ctx: AdminBarContext }>();
const el = useTemplateRef("el");
let handle: MountHandle<AdminBarContext> | undefined;

onMounted(() => {
  const result = props.mount(el.value!, props.ctx);
  handle = typeof result === "function" ? { unmount: result } : result;
});
watch(
  () => props.ctx,
  (ctx) => handle?.update?.(ctx),
);
onUnmounted(() => handle?.unmount());
</script>

<template>
  <div ref="el" class="flex items-center" />
</template>
