<script setup lang="ts">
import { useEventListener } from "@vueuse/core";
import { ConfigProvider, ToolbarButton, ToolbarRoot } from "reka-ui";
import { onBeforeUnmount, ref, watch } from "vue";
import type { AdminBarContext } from "../../../core/src/admin/index.d.ts";
import X from "@lucide/vue/dist/esm/icons/x.mjs";
import { Button } from "@/shared/components/ui/button";
import { headroom, type HeadroomState } from "./headroom";
import AdminBarItem from "./AdminBarItem.vue";
import { barText } from "./messages";

const props = defineProps<{ ctx: AdminBarContext; root: HTMLElement; portal: HTMLElement }>();

const HEIGHT = 30;
const text = barText();

// Open menus hold focus, so focus inside the root also covers them.
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
  (state.value = headroom(state.value, scrollY, {
    height: HEIGHT,
    pinned: pinned.value || props.ctx.edit,
  }));
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
watch([pinned, () => props.ctx.edit], update);
onBeforeUnmount(() => cancelAnimationFrame(frame));
</script>

<template>
  <ConfigProvider :teleport-to="portal">
    <ToolbarRoot
      :aria-label="text.adminBar"
      loop
      :data-mode="ctx.mode"
      :data-position="ctx.position"
      :data-hidden="state.hidden"
      class="floating-bar bg-background/80 text-card-foreground border-border fixed z-999 flex h-10 items-center gap-0.5 rounded-full border px-2 shadow-lg backdrop-blur transition-opacity duration-200 data-[hidden=true]:pointer-events-none data-[hidden=true]:opacity-0 motion-reduce:transition-none"
    >
      <div
        class="scroll-fade-x scroll-fade-4 flex min-w-0 scrollbar-none items-center gap-1 overflow-x-auto *:shrink-0"
      >
        <template v-for="(item, index) in ctx.items" :key="item.id">
          <AdminBarItem :item :ctx />
          <span
            v-if="index < ctx.items.length - 1"
            class="bg-muted-foreground/70 h-5 w-px"
            aria-hidden="true"
          />
        </template>
      </div>
      <ToolbarButton as-child>
        <Button
          variant="ghost"
          size="icon-xs"
          :aria-label="ctx.mode === 'preview-tab' ? text.exitPreview : text.dismiss"
          @click="ctx.dismiss"
          ><X
        /></Button>
      </ToolbarButton>
    </ToolbarRoot>
  </ConfigProvider>
</template>
