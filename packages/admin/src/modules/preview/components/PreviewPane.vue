<script setup lang="ts">
import { ref, watch } from "vue";
import { Icon, Pane } from "@/shared";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Switch } from "@/shared/components/ui/switch";

// `url`: the iframe's `src`; `null` when the document has no preview, `undefined` while it loads.
// `href`: the page's URL as the runtime last reported it.
// `target`: names the tab "Open in new tab" opens, so a second click reuses it.
// `frame`: a new value reloads the iframe, also when `url` did not change.
const props = withDefaults(
  defineProps<{ url?: string | null; href?: string; target: string; frame?: number }>(),
  { href: "", frame: 0 },
);
const emit = defineEmits<{ reload: []; close: []; navigate: [url: string] }>();
const edit = defineModel<boolean>("edit", { default: true });
const mobile = ref(false);
// What the URL input shows. The page's URL replaces it, unless it is being edited.
const typed = ref("");
const editing = ref(false);
watch(
  () => props.href || props.url || "",
  (value) => {
    if (!editing.value) typed.value = value;
  },
  { immediate: true },
);
function submit() {
  editing.value = false;
  emit("navigate", typed.value.trim());
}
function reset() {
  editing.value = false;
  typed.value = props.href || props.url || "";
}

function openTab() {
  const href = props.href || props.url;
  if (href) window.open(href, `integral-preview-${props.target}`);
}
</script>

<template>
  <Pane title="Preview" :min="300" grow :collapsible="false">
    <template #header>
      <label class="flex shrink-0 items-center gap-1.5 pr-1 text-xs">
        <Switch v-model="edit" />
        Edit
      </label>
      <Button variant="ghost" size="icon-sm" aria-label="Reload" @click="emit('reload')">
        <Icon name="rotate-cw" />
      </Button>
      <form class="flex min-w-0 flex-1" @submit.prevent="submit">
        <Input
          v-model="typed"
          inputmode="url"
          aria-label="URL"
          class="h-8 text-xs"
          @input="editing = true"
          @keydown.esc="reset"
          @blur="reset"
        />
      </form>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Open in new tab"
        :disabled="!url"
        @click="openTab"
      >
        <Icon name="external-link" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        :aria-label="mobile ? 'Desktop' : 'Mobile'"
        @click="mobile = !mobile"
      >
        <Icon :name="mobile ? 'monitor' : 'smartphone'" />
      </Button>
      <Button variant="ghost" size="icon-sm" aria-label="Close" @click="emit('close')">
        <Icon name="x" />
      </Button>
    </template>
    <p
      v-if="url === null"
      class="text-muted-foreground flex h-full items-center justify-center text-sm"
    >
      No preview for this document
    </p>
    <div
      v-else-if="url"
      :data-mobile="mobile"
      class="group data-[mobile=true]:bg-muted h-full data-[mobile=true]:flex data-[mobile=true]:justify-center data-[mobile=true]:p-4"
    >
      <iframe
        :key="frame"
        :src="url"
        name="integral-preview"
        title="Preview"
        class="group-data-[mobile=true]:border-border block h-full w-full bg-white group-data-[mobile=true]:w-[390px] group-data-[mobile=true]:rounded-lg group-data-[mobile=true]:border"
      />
    </div>
  </Pane>
</template>
