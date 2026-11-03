<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { lengthHint } from "@/modules/documents/seo/seo-checks";
import Icon from "@/shared/components/Icon.vue";
import { Button } from "@/shared/components/ui/button";
import { Progress } from "@/shared/components/ui/progress";

const props = defineProps<{
  text: string;
  limits: { min: number; max: number };
  disabled?: boolean;
}>();
const emit = defineEmits<{ generate: [] }>();
const { t } = useI18n();
const hint = computed(() => lengthHint(props.text, props.limits));
const tone = computed(
  () =>
    ({
      missing: "text-destructive [&_[data-slot=progress-indicator]]:bg-destructive",
      long: "text-destructive [&_[data-slot=progress-indicator]]:bg-destructive",
      short: "text-warning [&_[data-slot=progress-indicator]]:bg-warning",
      almost: "text-warning [&_[data-slot=progress-indicator]]:bg-warning",
      good: "text-success [&_[data-slot=progress-indicator]]:bg-success",
    })[hint.value.status],
);
</script>

<template>
  <div class="mt-2 flex flex-col gap-1.5" :class="tone">
    <Progress :model-value="hint.progress * 100" />
    <div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
      <span class="font-medium">{{ t(`seo.${hint.status}`) }}</span>
      <span class="text-muted-foreground">
        {{ t("seo.count", { count: text.length, ...limits }) }},
        {{ t(`seo.${hint.rest}`, { n: hint.n }) }}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        class="text-foreground ml-auto h-7"
        :disabled="disabled"
        @click="emit('generate')"
      >
        <Icon name="sparkles" />
        {{ t("seo.generate") }}
      </Button>
    </div>
  </div>
</template>
