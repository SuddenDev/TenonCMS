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
} from "@/shared/components/ui/alert-dialog";

defineProps<{ title: string; text: string; action: string; destructive?: boolean }>();
const open = defineModel<boolean>("open", { required: true });
const emit = defineEmits<{ confirm: [] }>();
const { t } = useI18n();
</script>

<template>
  <AlertDialog v-model:open="open">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{{ title }}</AlertDialogTitle>
        <AlertDialogDescription>{{ text }}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>{{ t("common.cancel") }}</AlertDialogCancel>
        <AlertDialogAction
          :variant="destructive ? 'destructive' : 'default'"
          @click="emit('confirm')"
        >
          {{ action }}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
