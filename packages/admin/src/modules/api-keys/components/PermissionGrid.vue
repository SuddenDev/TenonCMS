<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import type { ApiKeyOp, ApiKeyPermissions } from "../../../../../core/src/client";
import Icon from "@/shared/components/Icon.vue";
import { Button } from "@/shared/components/ui/button";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { API_KEY_OPS, type GridGroup, type GridRow } from "../api-keys";

// A row per target, a column per operation, rows under collapsible groups that start closed. Without `readonly`, the
// "All" row and each group row toggle their targets in a column.
const props = defineProps<{ groups: GridGroup[]; readonly?: boolean }>();
const grants = defineModel<ApiKeyPermissions>({ required: true });
const { t } = useI18n();

const open = ref(new Set<string>());
const allRows = computed(() => props.groups.flatMap((g) => g.rows));

const has = (target: string, op: ApiKeyOp) => !!grants.value[target]?.includes(op);
const takes = (rows: GridRow[], op: ApiKeyOp) =>
  rows.filter((r) => r.ops.includes(op)).map((r) => r.target);

function state(targets: string[], op: ApiKeyOp): boolean | "indeterminate" {
  const granted = targets.filter((target) => has(target, op)).length;
  if (!granted) return false;
  return granted === targets.length || "indeterminate";
}

// One write per change: the model updates only after the parent renders, so a second write would start from the old
// value.
function set(targets: string[], op: ApiKeyOp, on: boolean) {
  const next = { ...grants.value };
  for (const target of targets) {
    const ops = (next[target] ?? []).filter((o) => o !== op);
    if (on) ops.push(op);
    if (ops.length) next[target] = ops;
    else delete next[target];
  }
  grants.value = next;
}

function toggle(title: string) {
  const next = new Set(open.value);
  if (!next.delete(title)) next.add(title);
  open.value = next;
}
</script>

<template>
  <div class="scroll-fade-x overflow-x-auto rounded-md border">
    <table class="w-full text-sm">
      <thead>
        <tr class="bg-muted/50 text-muted-foreground border-b">
          <th class="min-w-40 px-3 py-2.5 text-left font-normal" />
          <th v-for="op in API_KEY_OPS" :key="op" class="w-20 px-2 py-2.5 text-center font-normal">
            {{ t(`apiKeys.ops.${op}`) }}
          </th>
        </tr>
        <tr v-if="!readonly" class="border-b">
          <th scope="row" class="px-3 py-3 text-left font-medium">{{ t("apiKeys.all") }}</th>
          <td v-for="op in API_KEY_OPS" :key="op" class="px-2 py-3 text-center">
            <Checkbox
              class="mx-auto"
              :model-value="state(takes(allRows, op), op)"
              :aria-label="`${t('apiKeys.all')}: ${t(`apiKeys.ops.${op}`)}`"
              @update:model-value="(on) => set(takes(allRows, op), op, on === true)"
            />
          </td>
        </tr>
      </thead>
      <tbody v-for="group in groups" :key="group.title" class="border-b last:border-b-0">
        <tr>
          <th scope="row" class="px-1 py-2 text-left">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              class="font-medium aria-expanded:bg-transparent"
              :aria-expanded="open.has(group.title)"
              @click="toggle(group.title)"
            >
              <Icon
                name="chevron-right"
                class="text-muted-foreground transition-transform"
                :class="{ 'rotate-90': open.has(group.title) }"
              />
              {{ group.title }}
            </Button>
          </th>
          <td v-for="op in API_KEY_OPS" :key="op" class="px-2 py-2 text-center">
            <Checkbox
              v-if="takes(group.rows, op).length"
              class="mx-auto"
              :model-value="state(takes(group.rows, op), op)"
              :disabled="readonly"
              :aria-label="`${group.title}: ${t(`apiKeys.ops.${op}`)}`"
              @update:model-value="(on) => set(takes(group.rows, op), op, on === true)"
            />
          </td>
        </tr>
        <tr
          v-for="row in group.rows"
          v-show="open.has(group.title)"
          :key="row.target"
          class="bg-muted/30 border-t align-top"
        >
          <th scope="row" class="py-3 pr-3 pl-10 text-left font-normal">
            {{ row.label }}
            <span v-if="row.description" class="text-muted-foreground block text-xs">
              {{ row.description }}
            </span>
          </th>
          <td v-for="op in API_KEY_OPS" :key="op" class="px-2 py-3 text-center">
            <Checkbox
              v-if="row.ops.includes(op)"
              class="mx-auto"
              :model-value="has(row.target, op)"
              :disabled="readonly"
              :aria-label="`${row.label}: ${t(`apiKeys.ops.${op}`)}`"
              @update:model-value="(on) => set([row.target], op, on === true)"
            />
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
