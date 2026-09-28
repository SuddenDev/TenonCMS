<script setup lang="ts">
import { inject, onMounted, onUnmounted, useTemplateRef, watch } from "vue";
import type { Mount, MountHandle } from "../../../core/src/admin/index.d.ts";
import { integralKey } from "../options";

const props = defineProps<{ mount: Mount<any>; ctx: Record<string, unknown> }>();
const el = useTemplateRef("el");
const integral = inject(integralKey)!;
let handle: MountHandle<unknown> | undefined;

onMounted(() => {
  const r = props.mount(el.value!, { ...props.ctx, integral });
  handle = typeof r === "function" ? { unmount: r } : r;
});
watch(
  () => props.ctx,
  (ctx) => handle?.update?.({ ...ctx, integral }),
  { deep: true },
);
onUnmounted(() => handle?.unmount());

// Host links under the admin path open in the admin without a reload, like RouterLink.
// Everything a browser handles on its own stays a normal link: other origins, `target`, `download`,
// modifier keys, other buttons, and clicks the host already handled.
function onClick(e: MouseEvent) {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
    return;
  const a = (e.target as Element).closest("a[href]");
  if (!a || a.hasAttribute("download") || (a.getAttribute("target") ?? "_self") !== "_self") return;
  const url = new URL(a.getAttribute("href")!, location.href);
  const { base } = integral;
  if (
    url.origin !== location.origin ||
    (url.pathname !== base && !url.pathname.startsWith(`${base}/`))
  )
    return;
  e.preventDefault();
  integral.navigate((url.pathname.slice(base.length) || "/") + url.search + url.hash);
}
</script>

<template>
  <div ref="el" @click="onClick" />
</template>
