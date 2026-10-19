<script setup lang="ts">
import { useI18n } from "vue-i18n";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/shared/components/ui/alert-dialog";

withDefaults(defineProps<{ name?: string; count?: number; disabled?: boolean }>(), {
  count: 1,
  disabled: false,
});
const open = defineModel<boolean>("open", { default: false });
const emit = defineEmits<{ confirm: [] }>();
const { t } = useI18n();
</script>

<template>
  <AlertDialog v-model:open="open">
    <AlertDialogTrigger v-if="$slots.default" as-child><slot /></AlertDialogTrigger>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{{
          name ? t("media.deleteTitle", { name }) : t("media.deleteSelectedTitle", { count })
        }}</AlertDialogTitle>
        <AlertDialogDescription>{{
          t(name ? "media.deleteText" : "media.deleteSelectedText")
        }}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel :disabled="disabled">{{ t("common.cancel") }}</AlertDialogCancel>
        <AlertDialogAction variant="destructive" :disabled="disabled" @click="emit('confirm')">{{
          t("common.delete")
        }}</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
