<script setup lang="ts">
import { computed, ref, useId, watch } from "vue";
import { useI18n } from "vue-i18n";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";

withDefaults(defineProps<{ error?: string }>(), { error: "" });
const open = defineModel<boolean>("open", { required: true });
const emit = defineEmits<{ submit: [name: string] }>();
const { t } = useI18n();
const id = useId();
const name = ref("");
const canSubmit = computed(() => !!name.value.trim().replace(/^\/+|\/+$/g, ""));

watch(open, (value) => {
  if (value) name.value = "";
});

function submit() {
  if (canSubmit.value) emit("submit", name.value.trim());
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent :aria-describedby="undefined">
      <DialogHeader>
        <DialogTitle>{{ t("media.newFolder") }}</DialogTitle>
      </DialogHeader>
      <form :id="id" class="space-y-2" @submit.prevent="submit">
        <Label :for="`${id}-name`">{{ t("media.folderName") }}</Label>
        <Input
          :id="`${id}-name`"
          v-model="name"
          required
          :aria-invalid="!!error"
          :aria-describedby="error ? `${id}-error` : undefined"
        />
        <p v-if="error" :id="`${id}-error`" class="text-destructive text-sm" role="alert">
          {{ error }}
        </p>
      </form>
      <DialogFooter>
        <Button type="button" variant="outline" @click="open = false">{{
          t("common.cancel")
        }}</Button>
        <Button type="submit" :form="id" :disabled="!canSubmit">{{
          t("media.createFolder")
        }}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
