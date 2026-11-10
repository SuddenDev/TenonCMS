<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import Icon from "@/shared/components/Icon.vue";
import { useLocale } from "@/shared/composables/useLocale";
import { useTimeZone } from "@/shared/composables/useTimeZone";
import { localeLabel } from "@/shared/locale";
import { formatDateTime } from "@/shared/utils";
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
import { ButtonGroup, ButtonGroupSeparator } from "@/shared/components/ui/button-group";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";

// `disabled`: Publish has nothing to do. `busy`: a request runs, so the menu waits too.
// `canSchedule`, `canUnpublish`: the entries of the chevron menu. Without either, there is no chevron.
// `localized`: the unpublish names the active language.
// `scheduledAt`: when the scheduled publish of the active language runs. The button then opens the schedule instead.
const props = defineProps<{
  disabled?: boolean;
  busy?: boolean;
  canSchedule?: boolean;
  canUnpublish?: boolean;
  localized?: boolean;
  scheduledAt?: string;
}>();
const emit = defineEmits<{ publish: []; schedule: []; unpublish: [] }>();
const { t, locale: uiLocale } = useI18n();
const { locale } = useLocale();
const { timeZone } = useTimeZone();
const confirming = ref(false);

const tint = computed(
  () => props.scheduledAt && "bg-scheduled text-scheduled-foreground hover:bg-scheduled/85",
);
const scheduledTitle = computed(
  () =>
    props.scheduledAt &&
    t("documents.scheduledPublish", {
      when: formatDateTime(props.scheduledAt, uiLocale.value, timeZone.value),
    }),
);
</script>

<template>
  <ButtonGroup>
    <Button
      v-if="scheduledAt"
      type="button"
      size="sm"
      :class="tint"
      :title="scheduledTitle"
      :disabled="busy"
      @click="emit('schedule')"
    >
      <Icon name="calendar-clock" />
      {{ t("documents.publishScheduled") }}
    </Button>
    <Button v-else type="button" size="sm" :disabled="disabled" @click="emit('publish')">
      <Icon name="upload" />
      {{ t("documents.publish") }}
    </Button>
    <ButtonGroupSeparator
      v-if="canSchedule || canUnpublish"
      :class="scheduledAt ? 'bg-scheduled-foreground/30' : 'bg-primary-foreground/30'"
    />
    <DropdownMenu v-if="canSchedule || canUnpublish">
      <DropdownMenuTrigger as-child>
        <Button
          type="button"
          size="icon-sm"
          :class="tint"
          :disabled="busy"
          :aria-label="t('documents.publishOptions')"
        >
          <Icon name="chevron-down" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem v-if="canSchedule" @select="emit('schedule')">
          <Icon name="clock" />
          {{ t("documents.schedule") }}
        </DropdownMenuItem>
        <DropdownMenuItem v-if="canUnpublish" variant="destructive" @select="confirming = true">
          <Icon name="circle-off" />
          {{ t("documents.unpublish") }}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </ButtonGroup>
  <AlertDialog v-model:open="confirming">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{{ t("documents.unpublishTitle") }}</AlertDialogTitle>
        <AlertDialogDescription>
          {{
            localized && locale
              ? t("documents.unpublishLocaleText", { language: localeLabel(locale) })
              : t("documents.unpublishText")
          }}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>{{ t("common.cancel") }}</AlertDialogCancel>
        <AlertDialogAction variant="destructive" @click="emit('unpublish')">
          {{ t("documents.unpublish") }}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
