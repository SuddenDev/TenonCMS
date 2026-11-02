<script setup lang="ts">
import { computed, ref, shallowRef } from "vue";
import { useI18n } from "vue-i18n";
import { text } from "@/shared/i18n";
import { client, schema } from "@/shared/api";
import { structureChanges } from "@/modules/documents/sync-structure";
import type { AppliedStructure } from "../../../../../core/src/content/writes/sync-structure";
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
import { Button } from "@/shared/components/ui/button";

// Under the `translations` settings: makes every document of a collection follow its saved setting.
// `names`: the keys of the setting. Globals have one document, so their switch is enough.
const props = defineProps<{ names: string[] }>();
const emit = defineEmits<{ applied: [] }>();
const i18n = useI18n();
const { t } = i18n;

const collections = computed(() =>
  props.names.flatMap((name) => {
    const c = schema.value.collections?.[name];
    return c ? [{ name, label: text(c.label) ?? name }] : [];
  }),
);

const open = ref(false);
const busy = ref(false);
const error = ref("");
const pending = shallowRef<{ name: string; label: string; result: AppliedStructure }>();
const description = computed(() => {
  const p = pending.value;
  if (!p) return "";
  return [
    t("structure.applyCount", p.result.documents),
    ...structureChanges(p.result.locales, undefined, i18n),
  ].join(" ");
});

async function ask(name: string, label: string) {
  error.value = "";
  try {
    const result = await client.applySyncStructure(name, { dryRun: true });
    pending.value = { name, label, result };
    open.value = true;
  } catch (e) {
    error.value = (e as Error).message;
  }
}

async function apply() {
  busy.value = true;
  try {
    await client.applySyncStructure(pending.value!.name);
    emit("applied");
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section v-if="collections.length" class="mx-auto w-full max-w-2xl px-6 pb-10 sm:px-8">
    <h2 class="text-sm font-medium">{{ t("structure.applyTitle") }}</h2>
    <p class="text-muted-foreground mt-1 text-sm">{{ t("structure.applyText") }}</p>
    <ul class="divide-border border-border mt-3 divide-y rounded-md border">
      <li
        v-for="c in collections"
        :key="c.name"
        class="flex items-center justify-between gap-2 px-3 py-2 text-sm"
      >
        {{ c.label }}
        <Button
          type="button"
          variant="outline"
          size="sm"
          :disabled="busy"
          @click="ask(c.name, c.label)"
        >
          {{ t("structure.apply") }}
        </Button>
      </li>
    </ul>
    <p v-if="error" class="text-destructive mt-2 text-sm" role="alert">{{ error }}</p>
    <AlertDialog v-model:open="open">
      <AlertDialogContent v-if="pending">
        <AlertDialogHeader>
          <AlertDialogTitle>{{
            t("structure.applyConfirm", { name: pending.label })
          }}</AlertDialogTitle>
          <AlertDialogDescription>{{ description }}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{{ t("common.cancel") }}</AlertDialogCancel>
          <AlertDialogAction @click="apply">{{ t("structure.applyAction") }}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </section>
</template>
