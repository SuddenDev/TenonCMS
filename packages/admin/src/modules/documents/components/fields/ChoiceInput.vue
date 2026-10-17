<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import Icon from "@/shared/components/Icon.vue";
import { Button } from "@/shared/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/shared/components/ui/toggle-group";
import { Checkbox } from "@/shared/components/ui/checkbox";
import {
  Combobox,
  ComboboxAnchor,
  ComboboxEmpty,
  ComboboxInputControl,
  ComboboxItem,
  ComboboxItemIndicator,
  ComboboxList,
  ComboboxViewport,
} from "@/shared/components/ui/combobox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/shared/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/shared/components/ui/radio-group";

// One value of `options`, or an array of them with `many`. The default slot sits next to a single dropdown.
const props = defineProps<{
  id: string;
  options: { value: string; label: string }[];
  many?: boolean;
  appearance?: "dropdown" | "list" | "buttons";
  required?: boolean;
  disabled?: boolean;
  invalid?: boolean;
}>();
const model = defineModel<any>();
const { t } = useI18n();
const values = computed<string[]>(() => model.value ?? []);
const label = (v: string) => props.options.find((o) => o.value === v)?.label ?? v;
// Multiple comboboxes keep the search term after a pick, so it is cleared here.
const search = ref("");
const open = ref(false);
const toggle = (v: string, on: boolean) =>
  (model.value = on ? [...values.value, v] : values.value.filter((x) => x !== v));
</script>

<template>
  <ToggleGroup
    v-if="appearance === 'buttons'"
    :id="id"
    :type="many ? 'multiple' : 'single'"
    orientation="horizontal"
    variant="outline"
    size="lg"
    :model-value="many ? values : (model ?? undefined)"
    :required="required"
    :disabled="disabled"
    :aria-invalid="invalid"
    class="max-w-full flex-wrap"
    @update:model-value="(v: any) => (model = many ? v : (v ?? null))"
  >
    <ToggleGroupItem v-for="o in options" :key="o.value" :value="o.value">
      {{ o.label }}
    </ToggleGroupItem>
  </ToggleGroup>
  <div
    v-else-if="appearance === 'list' && many"
    :id="id"
    role="group"
    class="flex flex-col gap-3 py-1"
  >
    <label v-for="o in options" :key="o.value" class="flex min-h-6 items-center gap-3 text-sm">
      <Checkbox
        :model-value="values.includes(o.value)"
        :disabled="disabled"
        :aria-invalid="invalid"
        @update:model-value="(on) => toggle(o.value, on === true)"
      />
      {{ o.label }}
    </label>
  </div>
  <RadioGroup
    v-else-if="appearance === 'list'"
    :id="id"
    :model-value="model ?? undefined"
    :required="required"
    class="gap-3 py-1"
    :disabled="disabled"
    @update:model-value="(v) => (model = v)"
  >
    <label v-for="o in options" :key="o.value" class="flex min-h-6 items-center gap-3 text-sm">
      <RadioGroupItem :value="o.value" :aria-invalid="invalid" />
      {{ o.label }}
    </label>
  </RadioGroup>
  <Combobox
    v-else-if="many"
    :model-value="values"
    multiple
    open-on-click
    :disabled="disabled"
    @update:model-value="
      (v) => {
        model = v;
        search = '';
      }
    "
  >
    <ComboboxAnchor
      :aria-invalid="invalid"
      class="border-input focus-within:border-ring focus-within:ring-ring/50 aria-invalid:border-destructive dark:bg-input/30 flex min-h-9 w-full flex-wrap items-center gap-1 rounded-md border px-1.5 py-1 shadow-xs focus-within:ring-3"
    >
      <span
        v-for="v in values"
        :key="v"
        class="bg-muted dark:bg-secondary text-secondary-foreground inline-flex h-6 items-center gap-0.5 rounded-md pl-2 text-xs"
      >
        {{ label(v) }}
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          :disabled="disabled"
          :aria-label="`${t('common.remove')} ${label(v)}`"
          @click="toggle(v, false)"
        >
          <Icon name="x" />
        </Button>
      </span>
      <ComboboxInputControl
        :id="id"
        v-model="search"
        :disabled="disabled"
        :aria-invalid="invalid"
        class="placeholder:text-muted-foreground h-6 min-w-24 flex-1 bg-transparent px-1 text-sm outline-none"
      />
      <Icon name="chevron-down" class="text-muted-foreground mx-1 size-4 shrink-0" />
    </ComboboxAnchor>
    <ComboboxList>
      <ComboboxViewport>
        <ComboboxEmpty>{{ t("common.noMatches") }}</ComboboxEmpty>
        <ComboboxItem v-for="o in options" :key="o.value" :value="o.value">
          {{ o.label }}
          <ComboboxItemIndicator><Icon name="check" /></ComboboxItemIndicator>
        </ComboboxItem>
      </ComboboxViewport>
    </ComboboxList>
  </Combobox>
  <div v-else class="flex gap-2">
    <Popover v-model:open="open">
      <PopoverTrigger as-child>
        <Button
          :id="id"
          type="button"
          variant="outline"
          role="combobox"
          :disabled="disabled"
          :aria-invalid="invalid"
          class="border-input dark:bg-input/30 min-w-0 flex-1 justify-between font-normal"
        >
          <span class="truncate">{{ model ? label(model) : "" }}</span>
          <Icon name="chevrons-up-down" class="text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" class="w-(--reka-popover-trigger-width) p-0">
        <Command
          :model-value="model ?? undefined"
          @update:model-value="
            (v) => {
              model = v ?? null;
              open = false;
            }
          "
        >
          <CommandInput :placeholder="t('nav.search')" />
          <CommandList>
            <CommandEmpty>{{ t("common.noMatches") }}</CommandEmpty>
            <CommandGroup>
              <CommandItem v-for="o in options" :key="o.value" :value="o.value">
                {{ o.label }}
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
    <!-- Lets the browser's form check enforce `required`, which the popover cannot. -->
    <input
      v-if="required"
      :value="model ?? ''"
      required
      tabindex="-1"
      aria-hidden="true"
      class="sr-only"
    />
    <slot />
    <Button
      v-if="!required && model && !disabled"
      type="button"
      variant="ghost"
      size="icon"
      :aria-label="t('common.clear')"
      @click="model = null"
    >
      <Icon name="x" />
    </Button>
  </div>
</template>
