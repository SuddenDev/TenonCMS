<script lang="ts">
export interface PaneProps {
  title: string;
  /** Minimum width of the pane in pixels */
  min?: number;
  /** Maximum width of the pane in pixels */
  max?: number;
  /** Whether the pane should grow to fill available space */
  grow?: boolean;
  /** Whether the pane is collapsible */
  collapsible?: boolean;
  /** Initial width in pixels. Defaults to `min` */
  width?: number;
  /** Edge of the resize handle */
  handle?: "left" | "right";
}
</script>
<script setup lang="ts">
import { useForwardExpose } from "reka-ui";
import { computed } from "vue";
import Icon from "@/shared/components/Icon.vue";
import { COLLAPSED, usePane } from "@/shared/composables/usePanes";
import { Button } from "../ui/button";
import { ScrollArea } from "../ui/scroll-area";

const props = withDefaults(defineProps<PaneProps>(), {
  min: 300,
  max: 400,
  grow: false,
  collapsible: true,
  width: undefined,
  handle: "right",
});
const { forwardRef, currentElement } = useForwardExpose();
const { collapsed, hidden, stacked, toggle, back, width, resize } = usePane(
  currentElement,
  props.min,
  props.max,
  props.collapsible,
  props.width,
);

const style = computed(() =>
  stacked.value
    ? { flex: "1 1 0", minWidth: 0 }
    : collapsed.value
      ? { width: `${COLLAPSED}px`, flex: "none" }
      : props.grow
        ? { minWidth: `${props.min}px`, flex: "1 1 0" }
        : { width: `${width.value}px` },
);

function startResize(e: PointerEvent) {
  const handle = e.currentTarget as HTMLElement;
  const from = width.value;
  const sign = props.handle === "left" ? -1 : 1;
  const move = (ev: PointerEvent) => resize(from + sign * (ev.clientX - e.clientX));
  handle.setPointerCapture(e.pointerId);
  handle.addEventListener("pointermove", move);
  handle.addEventListener("pointerup", () => handle.removeEventListener("pointermove", move), {
    once: true,
  });
}
</script>

<template>
  <section
    v-show="!hidden"
    :ref="forwardRef"
    class="border-border bg-background relative flex h-full shrink-0 flex-col border-r"
    :style="style"
  >
    <button
      v-if="collapsed"
      type="button"
      class="hover:bg-muted flex h-full flex-col items-center gap-3 py-3"
      :title="`Expand ${title}`"
      @click="toggle"
    >
      <span class="text-sm font-medium [writing-mode:vertical-rl]">{{ title }}</span>
    </button>
    <template v-else>
      <slot name="header" :toggle="toggle">
        <header class="border-border flex h-12 shrink-0 items-center gap-1 border-b pr-2 pl-3">
          <button
            v-if="back"
            type="button"
            class="hover:bg-muted -ml-1 flex size-8 shrink-0 items-center justify-center rounded-md"
            aria-label="Back"
            @click="back"
          >
            <Icon name="chevron-left" />
          </button>
          <h2 v-if="!collapsible" class="w-full min-w-0 truncate text-sm font-medium">
            {{ title }}
          </h2>
          <div v-else class="w-full min-w-0">
            <Button
              variant="ghost"
              :title="stacked ? undefined : `Collapse ${title}`"
              class="-ml-2 min-w-0 flex-1 truncate text-left"
              size="sm"
              @click="toggle"
            >
              {{ title }}
            </Button>
          </div>
          <slot name="actions" />
        </header>
      </slot>
      <ScrollArea
        class="min-h-0 flex-1 [&>[data-reka-scroll-area-viewport]>div]:block [&>[data-reka-scroll-area-viewport]>div]:h-full"
      >
        <slot />
      </ScrollArea>
      <div
        v-if="!grow && !stacked"
        :data-handle="handle"
        class="hover:bg-ring/10 absolute inset-y-0 z-20 w-2 cursor-col-resize touch-none transition-colors data-[handle=left]:-left-1 data-[handle=right]:-right-1"
        role="separator"
        aria-orientation="vertical"
        :aria-label="`Resize ${title}`"
        @pointerdown.prevent="startResize"
      />
    </template>
  </section>
</template>
