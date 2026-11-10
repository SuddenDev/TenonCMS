<script setup lang="ts">
import { useClipboard } from "@vueuse/core";
import { useI18n } from "vue-i18n";
import Icon from "@/shared/components/Icon.vue";
import { Button } from "@/shared/components/ui/button";

const props = defineProps<{ title: string; value: string }>();
const { t } = useI18n();
const { copy, copied } = useClipboard({ source: () => props.value });
</script>

<template>
  <section class="border-border bg-card rounded-lg border">
    <header class="border-border flex items-center justify-between border-b py-1 pr-1 pl-3">
      <h3 class="text-sm font-medium">{{ title }}</h3>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        :aria-label="t('common.copy')"
        :title="t('common.copy')"
        @click="copy()"
      >
        <Icon :name="copied ? 'check' : 'copy'" />
      </Button>
    </header>
    <pre class="max-h-72 overflow-auto p-3 font-mono text-xs">{{ value }}</pre>
  </section>
</template>
