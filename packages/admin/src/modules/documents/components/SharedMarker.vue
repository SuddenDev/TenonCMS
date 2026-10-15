<script setup lang="ts">
import { useI18n } from "vue-i18n";
import Icon from "@/shared/components/Icon.vue";

const { t } = useI18n();
</script>

<template>
  <span
    class="text-muted-foreground ml-1 inline-flex align-middle text-xs"
    :title="t('documents.shared')"
    role="img"
    :aria-label="t('documents.shared')"
  >
    <Icon name="languages" />
  </span>
</template>
