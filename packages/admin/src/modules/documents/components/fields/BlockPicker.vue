<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { text } from "@/shared/i18n";
import type { Block } from "@/shared/api";
import Icon from "@/shared/components/Icon.vue";
import { injectPaneElement } from "@/shared/components/pane/context";
import { Button } from "@/shared/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/shared/components/ui/dialog";

// The block picker. It opens inside the document pane, so the preview next to it stays visible.
defineProps<{ blocks: Record<string, Block>; label: string }>();
const open = defineModel<boolean>("open", { required: true });
const emit = defineEmits<{ pick: [blockType: string] }>();
const { t } = useI18n();
const pane = injectPaneElement(null);

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
      class="max-h-[calc(100%-2rem)] grid-rows-[auto_minmax(0,1fr)] sm:max-w-2xl"
    >
      <DialogHeader>
        <DialogTitle>{{ t("items.add", { label: label }) }}</DialogTitle>
      </DialogHeader>
      <div
        class="-m-1 grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-2 overflow-y-auto p-1"
      >
        <Button
          v-for="(block, key) in blocks"
          :key="key"
          type="button"
          variant="outline"
          class="h-auto flex-col items-stretch justify-start gap-1.5 p-2 text-left font-normal whitespace-normal"
          @click="pick(String(key))"
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
