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

// An invite link to pass on by hand: without email configuration, or when sending failed.
defineProps<{ email: string; link: string; failed?: boolean }>();
const open = defineModel<boolean>("open", { required: true });

const { t } = useI18n();
const copied = ref(false);

async function copy(link: string) {
  await navigator.clipboard.writeText(link);
  copied.value = true;
  setTimeout(() => (copied.value = false), 2000);
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{{ t("users.linkTitle", { email }) }}</DialogTitle>
        <DialogDescription>
          <span v-if="failed" class="text-destructive">{{ t("users.sendFailed") }} </span>
          {{ t("users.linkText") }}
        </DialogDescription>
      </DialogHeader>
      <div class="flex gap-2">
        <Input
          :model-value="link"
          readonly
          :aria-label="t('users.linkTitle', { email })"
          @focus="($event.target as HTMLInputElement).select()"
        />
        <Button variant="outline" @click="copy(link)">
          <Icon :name="copied ? 'check' : 'copy'" />
          {{ t(copied ? "common.copied" : "common.copy") }}
        </Button>
      </div>
    </DialogContent>
  </Dialog>
</template>
