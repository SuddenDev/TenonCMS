<script setup lang="ts">
import { computed, inject } from "vue";
import { useI18n } from "vue-i18n";
import { paneExpansionKey } from "@/shared/composables/usePanes";
import { Button } from "../ui/button";
import Icon from "../Icon.vue";
const props = withDefaults(defineProps<{ expanded?: boolean }>(), { expanded: undefined });
const emit = defineEmits<{ toggle: [] }>();
const pane = inject(paneExpansionKey, undefined);
const { t } = useI18n();
const active = computed(() => props.expanded ?? pane?.expanded.value ?? false);
function toggle() {
  if (props.expanded !== undefined) emit("toggle");
  else pane?.toggleExpand();
}
</script>
<template>
  <Button
    v-if="pane || expanded !== undefined"
    type="button"
    variant="ghost"
    size="icon-sm"
    :aria-expanded="active"
    :aria-label="t(active ? 'pane.restore' : 'pane.maximize')"
    :title="t(active ? 'pane.restore' : 'pane.maximize')"
    @click="toggle"
  >
    <Icon :key="String(active)" :name="active ? 'minimize-2' : 'maximize-2'" />
  </Button>
</template>
