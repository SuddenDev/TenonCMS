<script setup lang="ts">
import { useI18n } from "vue-i18n";
import Icon from "@/shared/components/Icon.vue";

const { t } = useI18n();
</script>

<template>
  <span
    data-slot="spinner"
    role="status"
    :aria-label="t('common.loading')"
    class="inline-flex size-4 shrink-0 items-center justify-center"
  >
    <Icon name="loader-circle" class="motion-safe:animate-spin" aria-hidden="true" />
  </span>
</template>
