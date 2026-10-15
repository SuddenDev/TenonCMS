<script setup lang="ts">
import { CONTENT } from "@/shared/options";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import DocPane from "@/modules/documents/components/DocPane.vue";
import { useRefs } from "@/modules/documents/composables/useRefs";
import Icon from "@/shared/components/Icon.vue";
import { Button } from "@/shared/components/ui/button";

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const name = route.params.name as string;
const id = route.params.id as string;
const { refs, openAt, closeAt } = useRefs();
</script>

<template>
  <DocPane
    :name="name"
    :id="id"
    :open="openAt(-1)"
    @deleted="router.push(`${CONTENT}/collections/${name}`)"
  >
    <template #actions>
      <Button
        variant="ghost"
        size="icon-sm"
        :aria-label="t('common.close')"
        @click="router.push(`${CONTENT}/collections/${name}`)"
      >
        <Icon name="x" />
      </Button>
    </template>
  </DocPane>
  <DocPane
    v-for="(r, i) in refs"
    :key="`${i}:${r.key}`"
    :name="r.collection"
    :id="r.id"
    :open="openAt(i)"
    closable
    @close="closeAt(i)"
    @deleted="closeAt(i)"
  />
</template>
