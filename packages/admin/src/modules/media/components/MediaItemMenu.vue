<script setup lang="ts">
import { useI18n } from "vue-i18n";
import Icon from "@/shared/components/Icon.vue";
import { Button } from "@/shared/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";

defineProps<{ name: string; href: string; downloadLabel: string; disabled?: boolean }>();
const emit = defineEmits<{ rename: []; move: []; delete: [] }>();
const { t } = useI18n();
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        :aria-label="t('media.itemActions', { name })"
        :disabled="disabled"
      >
        <Icon name="ellipsis" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      <DropdownMenuItem as="a" :href="href" download :aria-label="downloadLabel">
        <Icon name="download" />{{ t("media.download") }}
      </DropdownMenuItem>
      <DropdownMenuItem @select="emit('rename')">
        <Icon name="pencil" />{{ t("media.rename") }}
      </DropdownMenuItem>
      <DropdownMenuItem @select="emit('move')">
        <Icon name="folder-input" />{{ t("media.move") }}
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem variant="destructive" @select="emit('delete')">
        <Icon name="trash-2" />{{ t("common.delete") }}
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
