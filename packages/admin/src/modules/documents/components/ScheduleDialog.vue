<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { CmsError } from "@/shared/api";
import { scheduledAction } from "@/modules/jobs/jobs";
import type { Job } from "../../../../../core/src/jobs/types";
import type { ScheduleAction } from "../../../../../core/src/schedule/types";
import type { Schedules } from "@/modules/documents/composables/useSchedules";
import DateField from "./fields/DateField.vue";
import Icon from "@/shared/components/Icon.vue";
import { useTimeZone } from "@/shared/composables/useTimeZone";
import { localeLabel } from "@/shared/locale";
import { ago, formatDateTime } from "@/shared/utils";
import { Button } from "@/shared/components/ui/button";
import { Checkbox } from "@/shared/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Label } from "@/shared/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/shared/components/ui/radio-group";

// `locales`: the languages of a localized entry. Each selected one gets its own schedule. Without them, there is one.
// `activeLocale`: the language that is selected when the dialog opens.
// `publishable`: the languages with a draft, or for an entry without languages whether it has one. A publish needs it.
const props = defineProps<{
  schedules: Schedules;
  locales?: string[];
  activeLocale?: string;
  publishable: string[] | boolean;
}>();
// `changed`: a schedule was made or cancelled, for hosts that show it elsewhere, e.g. a list badge. `ran`: a time in
// the past ran the action at once, so the document changed.
// `publish`: Publish now. The host publishes the active language, which also drops its schedule.
const emit = defineEmits<{ changed: [ran: boolean]; publish: [] }>();
const open = defineModel<boolean>("open", { default: false });
const { t, locale } = useI18n();
const { timeZone } = useTimeZone();

const actions = {
  publish: {
    label: "documents.publish",
    hint: "schedule.publishHint",
    icon: "upload",
    tone: "text-scheduled",
  },
  unpublish: {
    label: "documents.unpublish",
    hint: "schedule.unpublishHint",
    icon: "circle-off",
    tone: "text-muted-foreground",
  },
} as const satisfies Record<ScheduleAction, object>;

const action = ref<ScheduleAction>("publish");
const at = ref<string | null>(null);
const picked = ref<string[]>([]);
const error = ref("");
const busy = ref(false);

// The scheduled publish of the active language has its own card. The list shows the other jobs.
const current = computed(() => props.schedules.publishJob.value);
const others = computed(() => props.schedules.jobs.value.filter((job) => job !== current.value));
const updating = computed(() => !!current.value && action.value === "publish");
// A publish needs a draft in each language. An unpublish takes any.
const allowed = (l: string) =>
  action.value !== "publish" || (Array.isArray(props.publishable) && props.publishable.includes(l));
const chosen = computed(() =>
  props.locales?.length
    ? props.locales.filter((l) => picked.value.includes(l) && allowed(l))
    : [undefined],
);
const nothing = computed(
  () =>
    action.value === "publish" &&
    (props.locales?.length ? !props.locales.some(allowed) : props.publishable !== true),
);

watch(open, (isOpen) => {
  if (!isOpen) return;
  action.value = "publish";
  at.value = current.value?.runAt ?? null;
  picked.value = props.activeLocale ? [props.activeLocale] : [];
  error.value = "";
});

const toggle = (l: string, on: boolean | "indeterminate") =>
  (picked.value = on === true ? [...picked.value, l] : picked.value.filter((p) => p !== l));

const field = computed(() => ({
  type: "datetime" as const,
  label: t("schedule.at"),
  required: true,
}));

async function submit() {
  error.value = "";
  if (!at.value) return void (error.value = t("schedule.chooseTime"));
  if (!chosen.value.length) return void (error.value = t("schedule.chooseLanguage"));
  const past = Date.parse(at.value) <= Date.now();
  if (
    past &&
    !confirm(t(action.value === "publish" ? "schedule.pastPublish" : "schedule.pastUnpublish"))
  )
    return;

  busy.value = true;
  try {
    await props.schedules.schedule(action.value, at.value, chosen.value);
    open.value = false;
  } catch (e) {
    const errors = e instanceof CmsError ? e.body?.errors : undefined;
    error.value = errors?.at ?? errors?.[""] ?? (e as Error).message;
  } finally {
    busy.value = false;
    // A failure MAY come after some languages were scheduled or ran.
    emit("changed", past);
  }
}

async function cancel(id: string) {
  error.value = "";
  busy.value = true;
  try {
    await props.schedules.cancel(id);
    emit("changed", false);
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}

const date = (job: Job) => formatDateTime(job.runAt, locale.value, timeZone.value);
const style = (job: Job) => actions[scheduledAction(job) ?? "publish"];
const legend = "text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase";
const chip =
  "border-border hover:bg-muted/50 has-data-[state=checked]:border-primary has-data-[state=checked]:bg-muted/60 cursor-pointer rounded-lg border font-normal transition-colors";
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="gap-5 sm:max-w-lg">
      <DialogHeader class="-mx-4 flex-row items-start gap-3 border-b px-4 pt-2 pr-8 pb-4">
        <span
          class="bg-scheduled/10 text-scheduled flex size-9 shrink-0 items-center justify-center rounded-lg"
        >
          <Icon name="calendar-clock" />
        </span>
        <div class="flex flex-col gap-1">
          <DialogTitle>{{ t(current ? "schedule.scheduledTitle" : "schedule.title") }}</DialogTitle>
          <DialogDescription>{{ t("schedule.text") }}</DialogDescription>
        </div>
      </DialogHeader>

      <section
        v-if="current"
        class="border-scheduled/30 bg-scheduled/5 flex flex-wrap items-center gap-3 rounded-lg border p-3"
      >
        <div class="min-w-0 flex-1">
          <p class="font-medium">{{ date(current) }}</p>
          <p class="text-muted-foreground text-xs">
            {{ t("schedule.goesLive", { ago: ago(current.runAt, locale) }) }}
            <template v-if="current.locale"> · {{ localeLabel(current.locale) }}</template>
            <template v-if="current.user">
              · {{ t("schedule.by", { name: current.user.name || t("documents.someone") }) }}
            </template>
          </p>
        </div>
        <div class="flex gap-2">
          <Button
            type="button"
            variant="destructive"
            size="sm"
            :disabled="busy"
            @click="cancel(current.id)"
          >
            <Icon name="trash-2" />
            {{ t("schedule.delete") }}
          </Button>
          <Button type="button" size="sm" :disabled="busy" @click="emit('publish')">
            <Icon name="upload" />
            {{ t("schedule.publishNow") }}
          </Button>
        </div>
      </section>

      <form id="schedule-form" class="flex flex-col gap-5" @submit.prevent="submit">
        <fieldset>
          <legend :class="legend">{{ t("schedule.action") }}</legend>
          <RadioGroup v-model="action" class="grid gap-2 sm:grid-cols-2">
            <Label
              v-for="(option, value) in actions"
              :key="value"
              :for="`schedule-${value}`"
              :class="[chip, 'items-start gap-2.5 p-3']"
            >
              <RadioGroupItem :id="`schedule-${value}`" :value="value" class="mt-0.5" />
              <span class="flex flex-col gap-1">
                <span class="flex items-center gap-1.5 font-medium">
                  <Icon :name="option.icon" :class="option.tone" />
                  {{ t(option.label) }}
                </span>
                <span class="text-muted-foreground text-xs leading-snug">{{ t(option.hint) }}</span>
              </span>
            </Label>
          </RadioGroup>
        </fieldset>

        <DateField
          name="at"
          :field="field"
          :root="{}"
          :siblings="{ fields: {}, data: {} }"
          :model-value="at"
          @update:model-value="at = $event ?? null"
        />

        <fieldset v-if="locales?.length">
          <legend :class="legend">{{ t("schedule.languages") }}</legend>
          <div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Label
              v-for="l in locales"
              :key="l"
              :for="`schedule-${l}`"
              :class="[chip, 'px-2.5 py-2 has-disabled:cursor-not-allowed has-disabled:opacity-50']"
              :title="allowed(l) ? undefined : t('schedule.noDraft')"
            >
              <Checkbox
                :id="`schedule-${l}`"
                :model-value="picked.includes(l) && allowed(l)"
                :disabled="!allowed(l)"
                @update:model-value="toggle(l, $event)"
              />
              <span class="truncate">{{ localeLabel(l) }}</span>
            </Label>
          </div>
        </fieldset>

        <p v-if="nothing" class="text-muted-foreground text-sm">
          {{ t("schedule.nothingToPublish") }}
        </p>
        <p v-if="error" class="text-destructive text-sm" role="alert">{{ error }}</p>
      </form>

      <section v-if="others.length || !current">
        <h3 :class="legend">{{ t("schedule.upcoming") }}</h3>
        <ul
          v-if="others.length"
          class="divide-border border-border bg-muted/30 divide-y rounded-lg border"
        >
          <li v-for="job in others" :key="job.id" class="flex items-center gap-3 py-2 pr-1.5 pl-3">
            <Icon :name="style(job).icon" :class="style(job).tone" />
            <div class="min-w-0 flex-1">
              <p class="truncate font-medium">
                {{ t(style(job).label) }}
                <span v-if="job.locale" class="text-muted-foreground font-normal">
                  · {{ localeLabel(job.locale) }}
                </span>
              </p>
              <p class="text-muted-foreground text-xs">
                {{ date(job) }}
                <template v-if="job.user">
                  · {{ t("schedule.by", { name: job.user.name || t("documents.someone") }) }}
                </template>
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              :disabled="busy"
              :aria-label="t('schedule.cancel')"
              :title="t('schedule.cancel')"
              @click="cancel(job.id)"
            >
              <Icon name="x" />
            </Button>
          </li>
        </ul>
        <p
          v-else
          class="text-muted-foreground border-border rounded-lg border border-dashed p-3 text-center text-sm"
        >
          {{ t("schedule.nothing") }}
        </p>
      </section>

      <DialogFooter>
        <Button type="button" variant="outline" @click="open = false">
          {{ t("common.cancel") }}
        </Button>
        <Button type="submit" form="schedule-form" :disabled="busy || nothing">
          {{ t(updating ? "schedule.update" : "schedule.submit") }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
