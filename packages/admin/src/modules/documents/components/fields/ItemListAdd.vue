<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import type { Block } from "@/shared/api";
import Icon from "@/shared/components/Icon.vue";
import { Button } from "@/shared/components/ui/button";
import { DialogTrigger } from "@/shared/components/ui/dialog";
import BlockPicker from "./BlockPicker.vue";

defineProps<{
  blocks?: Record<string, Block>;
  label: string;
  disabled: boolean;
}>();
const emit = defineEmits<{ add: [blockType?: string] }>();
const { t } = useI18n();
const picking = ref(false);
</script>

<template>
  <BlockPicker
    v-if="blocks"
    v-model:open="picking"
    :blocks="blocks"
    :label="label"
    @pick="emit('add', $event)"
  >
    <DialogTrigger as-child>
      <Button type="button" variant="outline" class="w-full" size="lg" :disabled="disabled">
        <Icon name="plus" />{{ t("items.add", { label: label }) }}
      </Button>
    </DialogTrigger>
  </BlockPicker>
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
