<script setup lang="ts">
import { onBeforeUnmount } from "vue";
import { useI18n } from "vue-i18n";
import { pendingConfirm } from "@/shared/composables/useAction";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";

const { t } = useI18n();
onBeforeUnmount(() => pendingConfirm.value?.answer(false));
</script>

<template>
  <AlertDialog
    :open="!!pendingConfirm"
    @update:open="
      (open) => {
        if (!open) pendingConfirm?.answer(false);
      }
    "
  >
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{{ pendingConfirm?.label }}</AlertDialogTitle>
        <AlertDialogDescription>{{ pendingConfirm?.question }}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel @click="pendingConfirm?.answer(false)">{{
          t("common.cancel")
        }}</AlertDialogCancel>
        <AlertDialogAction @click="pendingConfirm?.answer(true)">{{
          pendingConfirm?.label
        }}</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
