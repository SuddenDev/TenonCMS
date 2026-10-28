<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import Icon from "@/shared/components/Icon.vue";
import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Input } from "@/shared/components/ui/input";

// The secret of a key that was just created. It is never shown again.
defineProps<{ name: string; secret: string }>();
const open = defineModel<boolean>("open", { required: true });

const { t } = useI18n();
const copied = ref(false);

async function copy(secret: string) {
  await navigator.clipboard.writeText(secret);
  copied.value = true;
  setTimeout(() => (copied.value = false), 2000);
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="w-full max-w-100">
      <DialogHeader>
        <DialogTitle>{{ t("apiKeys.secretTitle", { name }) }}</DialogTitle>
        <DialogDescription>{{ t("apiKeys.secretText") }}</DialogDescription>
      </DialogHeader>
      <div class="flex gap-2">
        <Input
          :model-value="secret"
          readonly
          class="font-mono"
          :aria-label="t('apiKeys.secretTitle', { name })"
          @focus="($event.target as HTMLInputElement).select()"
        />
        <Button variant="outline" @click="copy(secret)">
          <Icon :name="copied ? 'check' : 'copy'" />
          {{ t(copied ? "common.copied" : "common.copy") }}
        </Button>
      </div>
    </DialogContent>
  </Dialog>
</template>
