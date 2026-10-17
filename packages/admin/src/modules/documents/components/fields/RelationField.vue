<script setup lang="ts">
import { inject, ref } from "vue";
import { useI18n } from "vue-i18n";
import { client, schema } from "@/shared/api";
import { openRefKey, titleField } from "@/modules/documents/fields";
import type { FieldProps } from "./types";
import FieldFrame from "./FieldFrame.vue";
import ChoiceInput from "./ChoiceInput.vue";
import Icon from "@/shared/components/Icon.vue";
import { Button } from "@/shared/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/shared/components/ui/tooltip";

const props = defineProps<FieldProps<"relation">>();
const model = defineModel<any>();
const { t } = useI18n();
// shortcut: loads the target collection in full; add search and paging when collections grow.
const options = ref<{ value: string; label: string }[]>([]);
const openRef = inject(openRefKey, undefined);
const optionLabel = (v: string) => options.value.find((o) => o.value === v)?.label ?? v;
const target = props.field.collection;
client.find(target, { populate: false }).then((docs) => {
  const collection = schema.value.collections?.[target];
  const key = collection ? titleField(collection) : "";
  options.value = docs.map((d) => ({ value: d.id, label: String(d[key] || d.id) }));
});
</script>

<template>
  <FieldFrame v-bind="props" v-slot="{ id, required, invalid }">
    <div v-if="field.many" class="flex flex-col gap-2">
      <ChoiceInput
        :id="id"
        v-model="model"
        many
        :options="options"
        :disabled="field.readOnly"
        :invalid="invalid"
      />
      <div v-if="openRef && model?.length" class="flex flex-wrap gap-1">
        <Button
          v-for="v in model"
          :key="v"
          type="button"
          variant="outline"
          size="xs"
          @click="openRef(field.collection, v)"
        >
          {{ optionLabel(v) }}<Icon name="arrow-up-right" />
        </Button>
      </div>
    </div>
    <ChoiceInput
      v-else
      :id="id"
      v-model="model"
      :options="options"
      :required="required"
      :disabled="field.readOnly"
      :invalid="invalid"
    >
      <Tooltip v-if="openRef && model">
        <TooltipTrigger as-child>
          <Button
            type="button"
            variant="outline"
            size="icon"
            @click="openRef(field.collection, model)"
          >
            <Icon name="arrow-up-right" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{{ t("common.open") }}</p>
        </TooltipContent>
      </Tooltip>
    </ChoiceInput>
  </FieldFrame>
</template>
