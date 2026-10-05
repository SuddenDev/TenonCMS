<script setup lang="ts">
import { useEventListener, useMediaQuery } from "@vueuse/core";
import { ConfigProvider, ToolbarRoot } from "reka-ui";
import { computed, onBeforeUnmount, ref, watch } from "vue";
import type { AdminBarContext } from "../../../core/src/admin/index.d.ts";
import { headroom, type HeadroomState } from "./headroom";
import AdminBarItem from "./AdminBarItem.vue";
import AdminBarSheet from "./AdminBarSheet.vue";

const props = defineProps<{ ctx: AdminBarContext; root: HTMLElement; portal: HTMLElement }>();

const HEIGHT = 30;
const wide = useMediaQuery("(min-width: 640px)");
const start = computed(() => props.ctx.items.filter((item) => item.group === "start"));
const end = computed(() => props.ctx.items.filter((item) => item.group !== "start"));

// Open menus and the sheet hold focus, so focus inside the root also covers them.
const pinned = ref(false);
useEventListener(
  () => props.root,
  "focusin",
  () => (pinned.value = true),
);
useEventListener(
  () => props.root,
  "focusout",
  (event: FocusEvent) => (pinned.value = props.root.contains(event.relatedTarget as Node | null)),
);

const state = ref<HeadroomState>({ y: scrollY, hidden: false });
const update = () =>
  (state.value = headroom(state.value, scrollY, { height: HEIGHT, pinned: pinned.value }));
let frame = 0;
useEventListener(
  window,
  "scroll",
  () => {
    if (!frame)
      frame = requestAnimationFrame(() => {
        frame = 0;
        update();
      });
  },
  { passive: true },
);
watch(pinned, update);
onBeforeUnmount(() => cancelAnimationFrame(frame));
</script>

<template>
  <ConfigProvider :teleport-to="portal">
    <ToolbarRoot
      aria-label="Admin bar"
      loop
      :data-position="ctx.position"
      :data-hidden="state.hidden"
      class="bg-card/95 text-card-foreground border-border fixed inset-x-0 z-40 flex h-[30px] items-center gap-0.5 px-1.5 backdrop-blur transition-transform duration-200 ease-out data-[position=bottom]:bottom-0 data-[position=bottom]:border-t data-[hidden=true]:data-[position=bottom]:translate-y-full data-[position=top]:top-0 data-[position=top]:border-b data-[hidden=true]:data-[position=top]:-translate-y-full motion-reduce:transition-none"
    >
      <AdminBarItem v-for="item in start" :key="item.id" :item :ctx />
      <div class="flex-1" />
      <template v-if="wide">
        <AdminBarItem v-for="item in end" :key="item.id" :item :ctx align="end" />
      </template>
      <AdminBarSheet v-else-if="end.length" :items="end" :ctx />
    </ToolbarRoot>
  </ConfigProvider>
</template>
