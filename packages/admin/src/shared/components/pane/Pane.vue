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
import { useI18n } from "vue-i18n";
import Icon from "@/shared/components/Icon.vue";
import { COLLAPSED, usePane } from "@/shared/composables/usePanes";
import { Button } from "../ui/button";
import { providePaneElement } from "./context";
import { ScrollArea } from "../ui/scroll-area";

const props = withDefaults(defineProps<PaneProps>(), {
  min: 300,
  max: 400,
  grow: false,
  collapsible: true,
  width: undefined,
  handle: "right",
});
const { t } = useI18n();
const { forwardRef, currentElement } = useForwardExpose();
const { expanded, toggleExpand, collapsed, hidden, stacked, toggle, back, width, resize } = usePane(
  currentElement,
  props.min,
  props.max,
  props.collapsible,
  props.width,
);
providePaneElement(currentElement);

const style = computed(() =>
  stacked.value || expanded.value
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
    :data-expanded="expanded"
    :ref="forwardRef"
    class="group/pane border-border bg-background relative flex h-full shrink-0 flex-col border-r"
    :style="style"
  >
    <Button
      v-if="collapsed"
      type="button"
      variant="ghost"
      class="h-full flex-col justify-start rounded-none py-3"
      :title="t('pane.expand', { title })"
      @click="toggle"
    >
      <span class="text-sm font-medium [writing-mode:vertical-rl]">{{ title }}</span>
    </Button>
    <template v-else>
      <slot name="header" :toggle="toggle">
        <header class="border-border flex h-12 shrink-0 items-center gap-1 border-b pr-2 pl-3">
          <Button
            v-if="back"
            type="button"
            variant="ghost"
            size="icon-sm"
            class="-ml-1"
            :aria-label="t('common.back')"
            @click="back"
          >
            <Icon name="chevron-left" />
          </Button>
          <slot name="title">
            <h2 v-if="!collapsible" class="w-full min-w-0 truncate pl-1 text-[0.8rem] font-medium">
              {{ title }}
            </h2>
            <div v-else class="w-full min-w-0">
              <Button
                variant="ghost"
                :title="stacked ? undefined : t('pane.collapse', { title })"
                class="-ml-2 min-w-0 flex-1 truncate text-left"
                size="sm"
                @click="toggle"
              >
                {{ title }}
              </Button>
            </div>
          </slot>
          <slot name="actions" :expanded="expanded" :toggle-expand="toggleExpand" />
        </header>
      </slot>
      <ScrollArea
        class="min-h-0 flex-1 [&>[data-reka-scroll-area-viewport]>div]:block [&>[data-reka-scroll-area-viewport]>div]:h-full"
        :class="{
          '[&>[data-reka-scroll-area-viewport]>div]:mx-auto [&>[data-reka-scroll-area-viewport]>div]:max-w-[80vw]':
            expanded,
        }"
      >
        <slot />
      </ScrollArea>
      <div
        v-if="!grow && !stacked && !expanded"
        :data-handle="handle"
        class="hover:bg-ring/10 absolute inset-y-0 z-20 w-2 cursor-col-resize touch-none transition-colors data-[handle=left]:-left-1 data-[handle=right]:-right-1"
        role="separator"
        aria-orientation="vertical"
        :aria-label="t('pane.resize', { title })"
        @pointerdown.prevent="startResize"
      />
    </template>
  </section>
</template>
