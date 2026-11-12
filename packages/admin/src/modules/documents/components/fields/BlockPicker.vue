<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { text } from "@/shared/i18n";
import type { Block } from "@/shared/api";
import Icon from "@/shared/components/Icon.vue";
import { injectPaneElement } from "@/shared/components/pane/context";
import { Button } from "@/shared/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/shared/components/ui/dialog";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/shared/components/ui/input-group";

// The block picker. It opens inside the document pane, so the preview next to it stays visible.
const props = defineProps<{ blocks: Record<string, Block>; label: string }>();
const open = defineModel<boolean>("open", { required: true });
const emit = defineEmits<{ pick: [blockType: string] }>();
const { t } = useI18n();
const pane = injectPaneElement(null);
const query = ref("");
watch(open, (value) => value && (query.value = ""));

// Matches the label, the key and the description, ignoring case.
const shown = computed(() => {
  const q = query.value.trim().toLowerCase();
  return Object.entries(props.blocks).filter(([key, block]) =>
    [text(block.label), key, text(block.description)].some((s) => s?.toLowerCase().includes(q)),
  );
});

// The pick comes first: closing MAY clear what the pick is for.
function pick(key: string) {
  emit("pick", key);
  open.value = false;
}
</script>

<template>
  <Dialog v-model:open="open">
    <slot />
    <DialogContent
      :container="pane ?? undefined"
      class="max-h-[calc(100%-2rem)] grid-rows-[auto_auto_minmax(0,1fr)] sm:max-w-2xl"
    >
      <DialogHeader>
        <DialogTitle>{{ t("items.add", { label: label }) }}</DialogTitle>
      </DialogHeader>
      <InputGroup>
        <InputGroupAddon class="border-r-0 bg-transparent">
          <Icon name="search" />
        </InputGroupAddon>
        <InputGroupInput
          v-model="query"
          type="search"
          :placeholder="t('items.search')"
          :aria-label="t('items.search')"
          @keydown.enter.prevent="shown[0] && pick(shown[0][0])"
        />
      </InputGroup>
      <p v-if="!shown.length" class="text-muted-foreground text-sm">{{ t("common.noMatches") }}</p>
      <div
        v-else
        class="-m-1 grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-2 overflow-y-auto p-1"
      >
        <Button
          v-for="[key, block] in shown"
          :key="key"
          type="button"
          variant="outline"
          class="h-auto flex-col items-stretch justify-start gap-1.5 p-2 text-left font-normal whitespace-normal"
          @click="pick(key)"
        >
          <img
            v-if="block.image"
            :src="block.image"
            alt=""
            class="bg-muted aspect-video w-full rounded-sm object-cover"
          />
          <span
            v-else
            class="bg-muted text-muted-foreground flex aspect-video w-full items-center justify-center rounded-sm text-2xl"
          >
            <Icon :name="block.icon ?? 'blocks'" />
          </span>
          <span class="font-medium">{{ text(block.label) ?? key }}</span>
          <span v-if="block.description" class="text-muted-foreground text-xs">
            {{ text(block.description) }}
          </span>
        </Button>
      </div>
    </DialogContent>
  </Dialog>
</template>
