<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import Icon from "@/shared/components/Icon.vue";
import { Button } from "@/shared/components/ui/button";
import {
  Combobox,
  ComboboxAnchor,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxItemIndicator,
  ComboboxList,
  ComboboxTrigger,
  ComboboxViewport,
} from "@/shared/components/ui/combobox";
import { deviceTimeZone, timeZoneGroups, timeZoneLabel } from "@/shared/timezones";

defineOptions({ inheritAttrs: false });
/** An IANA time zone, or `null` for the device's. */
const model = defineModel<string | null>({ default: null });

const { t } = useI18n();
const open = ref(false);
// Built when opened: labeling every zone formats about 400 dates.
const groups = computed(() => (open.value ? timeZoneGroups() : []));
const device = timeZoneLabel(deviceTimeZone());
// reka rejects an empty item value, and no IANA name is `device`.
const DEVICE = "device";
const value = computed({
  get: () => model.value ?? DEVICE,
  set: (zone: string) => (model.value = zone === DEVICE ? null : zone),
});
const region = computed(() =>
  !model.value ? t("timezone.device") : model.value.includes("/") ? model.value.split("/")[0] : "",
);
</script>

<template>
  <Combobox v-model="value" v-model:open="open">
    <ComboboxAnchor as-child>
      <ComboboxTrigger as-child>
        <Button variant="outline" class="h-12 w-full justify-between px-2.5" v-bind="$attrs">
          <span class="flex min-w-0 flex-col items-start gap-0.5">
            <span class="text-muted-foreground text-xs font-normal">{{ region }}</span>
            <span class="truncate">{{ model ? timeZoneLabel(model) : device }}</span>
          </span>
          <Icon name="chevron-down" class="text-muted-foreground" />
        </Button>
      </ComboboxTrigger>
    </ComboboxAnchor>
    <ComboboxList class="w-72" align="start">
      <ComboboxInput :placeholder="t('timezone.search')" :display-value="() => ''" />
      <ComboboxViewport class="max-h-65">
        <ComboboxEmpty>{{ t("timezone.empty") }}</ComboboxEmpty>
        <ComboboxGroup :heading="t('timezone.device')">
          <ComboboxItem :value="DEVICE" :text-value="`${t('timezone.device')} ${device}`">
            {{ device }}
            <ComboboxItemIndicator><Icon name="check" /></ComboboxItemIndicator>
          </ComboboxItem>
        </ComboboxGroup>
        <ComboboxGroup v-for="group in groups" :key="group.region" :heading="group.region">
          <ComboboxItem
            v-for="zone in group.zones"
            :key="zone.value"
            :value="zone.value"
            :text-value="`${zone.value} ${zone.label}`"
          >
            {{ zone.label }}
            <ComboboxItemIndicator><Icon name="check" /></ComboboxItemIndicator>
          </ComboboxItem>
        </ComboboxGroup>
      </ComboboxViewport>
    </ComboboxList>
  </Combobox>
</template>
