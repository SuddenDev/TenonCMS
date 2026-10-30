<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { text } from "@/shared/i18n";
import type { Block } from "@/shared/api";
import Icon from "@/shared/components/Icon.vue";
import { Button } from "@/shared/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";

defineProps<{
  blocks?: Record<string, Block>;
  label: string;
  disabled: boolean;
}>();
const emit = defineEmits<{ add: [blockType?: string] }>();
const { t } = useI18n();
</script>

<template>
  <div>
    <DropdownMenu v-if="blocks">
      <DropdownMenuTrigger as-child>
        <Button type="button" variant="outline" class="w-full" size="lg" :disabled="disabled">
          <Icon name="plus" />{{ t("items.add", { label: label }) }}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem
          v-for="(block, key) in blocks"
          :key="key"
          class="items-start"
          @select="emit('add', String(key))"
        >
          <Icon v-if="block.icon" :name="block.icon" class="mt-0.5" />
          <span class="flex flex-col">
            <span>{{ text(block.label) ?? key }}</span>
            <span v-if="block.description" class="text-muted-foreground text-xs">{{
              text(block.description)
            }}</span>
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
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
  </div>
</template>
