<script setup lang="ts">
import { useI18n } from "vue-i18n";
import type { Job } from "../../../../../core/src/jobs/types";
import Icon from "@/shared/components/Icon.vue";
import { useTimeZone } from "@/shared/composables/useTimeZone";
import { formatDateTime } from "@/shared/utils";
import { Button } from "@/shared/components/ui/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/shared/components/ui/item";

// `job`: the scheduled publish of the active language. It locks the form until it runs or is cancelled.
// `open`: opens the schedule dialog, where it can be cancelled.
defineProps<{ job: Job }>();
const emit = defineEmits<{ open: [] }>();
const { t, locale } = useI18n();
const { timeZone } = useTimeZone();
</script>

<template>
  <Item variant="outline" class="border-scheduled/30 bg-scheduled/5 mt-4">
    <ItemMedia
      variant="icon"
      class="border-scheduled/30 bg-scheduled/10 text-scheduled size-10 rounded-[6px] border"
    >
      <Icon name="calendar-clock" class="text-base" />
    </ItemMedia>
    <ItemContent>
      <ItemTitle>{{ t("schedule.lockedTitle") }}</ItemTitle>
      <ItemDescription>
        {{
          t(job.user ? "schedule.lockedBy" : "schedule.locked", {
            when: formatDateTime(job.runAt, locale, timeZone),
            name: job.user?.name || t("documents.someone"),
          })
        }}
      </ItemDescription>
    </ItemContent>
    <ItemActions>
      <Button size="sm" variant="outline" @click="emit('open')">
        {{ t("schedule.open") }}
      </Button>
    </ItemActions>
  </Item>
</template>
