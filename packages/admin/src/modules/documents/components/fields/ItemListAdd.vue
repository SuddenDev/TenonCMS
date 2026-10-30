<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { text } from "@/shared/i18n";
import type { Block } from "@/shared/api";
import Icon from "@/shared/components/Icon.vue";
import { injectPaneElement } from "@/shared/components/pane/context";
import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/shared/components/ui/dialog";

defineProps<{
  blocks?: Record<string, Block>;
  label: string;
  disabled: boolean;
}>();
const emit = defineEmits<{ add: [blockType?: string] }>();
const { t } = useI18n();
// The picker opens inside the document pane, so the preview next to it stays visible.
const pane = injectPaneElement(null);
const picking = ref(false);

function pick(key: string) {
  picking.value = false;
  emit("add", key);
}
</script>

<template>
  <Dialog v-if="blocks" v-model:open="picking">
    <DialogTrigger as-child>
      <Button type="button" variant="outline" class="w-full" size="lg" :disabled="disabled">
        <Icon name="plus" />{{ t("items.add", { label: label }) }}
      </Button>
    </DialogTrigger>
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
  <Button
    v-else
    type="button"
    variant="outline"
    size="lg"
    class="w-full"
    :disabled="disabled"
    @click="emit('add')"
  >
    <Icon name="plus" />{{ t("items.add", { label: label }) }}
  </Button>
</template>
