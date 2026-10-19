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

const props = withDefaults(
  defineProps<{ name: string; label: string; error?: string; busy?: boolean }>(),
  { error: "", busy: false },
);
const open = defineModel<boolean>("open", { required: true });
const emit = defineEmits<{ submit: [name: string] }>();
const { t } = useI18n();
const id = useId();
const name = ref(props.name);
const canSubmit = computed(
  () => !props.busy && !!name.value.trim() && name.value.trim() !== props.name,
);

watch(
  open,
  (value) => {
    if (value) name.value = props.name;
  },
  { immediate: true },
);

function submit() {
  if (canSubmit.value) emit("submit", name.value.trim());
}
</script>

<template>
  <Dialog :open="open" @update:open="!busy && (open = $event)">
    <DialogContent :aria-describedby="undefined" :show-close-button="!busy">
      <DialogHeader>
        <DialogTitle>{{ t("media.renameTitle", { name: props.name }) }}</DialogTitle>
      </DialogHeader>
      <form :id="id" class="space-y-2" @submit.prevent="submit">
        <Label :for="`${id}-name`">{{ label }}</Label>
        <Input
          :id="`${id}-name`"
          v-model="name"
          required
          :disabled="busy"
          :aria-invalid="!!error"
          :aria-describedby="error ? `${id}-error` : undefined"
          @focus="($event.target as HTMLInputElement).select()"
        />
        <p v-if="error" :id="`${id}-error`" class="text-destructive text-sm" role="alert">
          {{ error }}
        </p>
      </form>
      <DialogFooter>
        <Button type="button" variant="outline" :disabled="busy" @click="open = false">{{
          t("common.cancel")
        }}</Button>
        <Button type="submit" :form="id" :disabled="!canSubmit">{{ t("media.rename") }}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
