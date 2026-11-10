<script setup lang="ts">
import { onBeforeUnmount } from "vue";
import { useI18n } from "vue-i18n";
import { linkedDeletion } from "@/shared/linked-deletion";
import { CONTENT } from "@/shared/options";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "./ui/alert-dialog";
import { Button } from "./ui/button";
const { t } = useI18n();
onBeforeUnmount(() => linkedDeletion.value?.finish(false));
</script>
<template>
  <AlertDialog
    :open="!!linkedDeletion"
    @update:open="
      (value) => {
        if (!value) linkedDeletion?.finish(false);
      }
    "
  >
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{{ t("richtext.deleteTitle") }}</AlertDialogTitle>
        <AlertDialogDescription>{{ t("richtext.deleteWarning") }}</AlertDialogDescription>
      </AlertDialogHeader>
      <ul class="max-h-60 space-y-2 overflow-y-auto text-sm">
        <li v-for="(reference, index) in linkedDeletion?.references ?? []" :key="index">
          <RouterLink
            class="underline"
            :to="
              reference.global
                ? `${CONTENT}/globals/${reference.global}`
                : `${CONTENT}/collections/${reference.collection}/${reference.id}`
            "
            @click="linkedDeletion?.finish(false)"
          >
            {{ reference.global ?? `${reference.collection} / ${reference.id}` }}
          </RouterLink>
          <span class="text-muted-foreground">
            · {{ reference.field }} {{ reference.locale }}
            {{ reference.draft ? `(${t("common.drafts")})` : "" }}</span
          >
        </li>
      </ul>
      <AlertDialogFooter>
        <AlertDialogCancel>{{ t("common.cancel") }}</AlertDialogCancel>
        <!-- Not an `AlertDialogAction`: it closes the dialog before its click handler runs, and closing cancels. -->
        <Button variant="destructive" @click="linkedDeletion?.finish(true)">{{
          t("richtext.deleteAnyway")
        }}</Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
