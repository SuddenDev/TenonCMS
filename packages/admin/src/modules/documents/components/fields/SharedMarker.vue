<script setup lang="ts">
import { useI18n } from "vue-i18n";
import Icon from "@/shared/components/Icon.vue";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/components/ui/tooltip";

const { t } = useI18n();
</script>

<template>
  <Tooltip>
    <TooltipTrigger as-child>
      <span class="text-muted-foreground ml-1 inline-flex align-middle text-[0.625rem]" role="img">
        <Icon name="languages" />
      </span>
    </TooltipTrigger>
    <TooltipContent align="center">
      {{ t("documents.shared") }}
    </TooltipContent>
  </Tooltip>
</template>
