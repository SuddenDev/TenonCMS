<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import {
  CalendarDateTime,
  getLocalTimeZone,
  parseAbsoluteToLocal,
  parseDate,
  toCalendarDate,
  today,
  type DateValue,
} from "@internationalized/date";
import type { FieldProps } from "./types";
import { text } from "@/shared/i18n";
import FieldFrame from "./FieldFrame.vue";
import Icon from "@/shared/components/Icon.vue";
import { Calendar } from "@/shared/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/components/ui/popover";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Button } from "@/shared/components/ui/button";
import { Tooltip } from "@/shared/components/ui/tooltip";

const props = defineProps<FieldProps<"date" | "datetime">>();
const model = defineModel<string | null>();
const { t, locale } = useI18n();
const dateLocale = computed(
  () =>
    navigator.languages.find((language) => language.split("-")[0] === locale.value) ?? locale.value,
);
const open = ref(false);
const datetime = computed(() => props.field.type === "datetime");
const parsed = computed(() => {
  if (!model.value) return undefined;
  try {
    return datetime.value ? parseAbsoluteToLocal(model.value) : parseDate(model.value);
  } catch {
    return undefined;
  }
});
const selected = computed(() => parsed.value && toCalendarDate(parsed.value));
const time = computed(() => {
  const value = parsed.value;
  if (!value || !("hour" in value)) return "12:00:00";
  return [value.hour, value.minute, value.second].map((n) => String(n).padStart(2, "0")).join(":");
});
const label = computed(() => {
  if (!parsed.value) return model.value;
  return new Intl.DateTimeFormat(dateLocale.value, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(datetime.value && { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
  }).format(parsed.value.toDate(getLocalTimeZone()));
});

function selectDate(value: DateValue | undefined) {
  if (!value) {
    model.value = null;
    return;
  }
  if (datetime.value) {
    const [hour, minute, second] = time.value.split(":").map(Number);
    model.value = new CalendarDateTime(value.year, value.month, value.day, hour, minute, second)
      .toDate(getLocalTimeZone())
      .toISOString();
  } else {
    model.value = toCalendarDate(value).toString();
    open.value = false;
  }
}

function setTime(value: string | number) {
  const input = String(value);
  if (!/^\d{2}:\d{2}(:\d{2})?$/.test(input)) return;
  const date = selected.value ?? today(getLocalTimeZone());
  const [hour, minute, second = 0] = input.split(":").map(Number);
  model.value = new CalendarDateTime(date.year, date.month, date.day, hour, minute, second)
    .toDate(getLocalTimeZone())
    .toISOString();
}

function clear() {
  model.value = null;
  open.value = false;
}
</script>

<template>
  <FieldFrame v-bind="props" v-slot="{ id, attrs, required, invalid }">
    <Popover v-model:open="open">
      <PopoverTrigger as-child>
        <button
          :id="id"
          type="button"
          class="dark:bg-input/30 border-input focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 flex h-9 w-full min-w-0 items-center justify-between gap-2 rounded-lg border bg-transparent px-2.5 py-1 text-left text-base transition-colors outline-none focus-visible:ring-3 disabled:pointer-events-none disabled:opacity-50 aria-invalid:ring-3 md:text-sm"
          :disabled="attrs.disabled"
          :aria-required="required"
          :aria-invalid="invalid"
        >
          <span class="min-w-0 truncate" :class="!model && 'text-muted-foreground'">
            {{
              label ||
              attrs.placeholder ||
              t(datetime ? "documents.selectDateTime" : "documents.selectDate")
            }}
          </span>
          <div class="inline-flex items-center gap-2">
            <Button
              v-if="model"
              variant="ghost"
              size="icon-sm"
              type="button"
              data-clear-date
              :disabled="attrs.disabled"
              @click.stop="clear"
            >
              <Icon name="x" class="text-muted-foreground" />
            </Button>
            <Icon name="calendar" class="text-muted-foreground" aria-hidden="true" />
          </div>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        class="w-auto gap-0 overflow-hidden p-0"
        :aria-label="text(field.label) ?? name"
      >
        <Calendar
          :model-value="selected"
          :locale="dateLocale"
          :disabled="attrs.disabled"
          initial-focus
          prevent-deselect
          @update:model-value="selectDate"
        />
        <div v-if="datetime" class="flex items-center gap-3 border-t p-3">
          <Label :for="`${id}-time`" class="shrink-0 text-xs">{{ t("documents.enterTime") }}</Label>
          <div class="relative grow">
            <Input
              :id="`${id}-time`"
              :model-value="time"
              type="time"
              step="1"
              :disabled="attrs.disabled"
              class="appearance-none ps-9 [&::-webkit-calendar-picker-indicator]:hidden"
              @update:model-value="setTime"
            />
            <Icon
              name="clock"
              aria-hidden="true"
              class="text-muted-foreground pointer-events-none absolute start-3 top-1/2 -translate-y-1/2"
            />
          </div>
        </div>
        <div v-if="model" class="border-t p-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            class="w-full"
            data-clear-date
            :disabled="attrs.disabled"
            @click="clear"
            >{{ t("common.clear") }}</Button
          >
        </div>
      </PopoverContent>
    </Popover>
    <input
      class="sr-only"
      tabindex="-1"
      :value="model ?? ''"
      :required="required"
      :disabled="attrs.disabled"
      :aria-label="text(field.label) ?? name"
      @invalid.prevent="open = true"
    />
  </FieldFrame>
</template>
