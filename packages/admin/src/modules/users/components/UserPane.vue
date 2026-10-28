<script setup lang="ts">
import { useHead } from "@unhead/vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import { Icon, Pane } from "@/shared";
import { Button } from "@/shared/components/ui/button";

const props = withDefaults(
  defineProps<{ title: string; kind: string; subtitle?: string; back?: string; wide?: boolean }>(),
  { back: "/users" },
);
const { t } = useI18n();
const router = useRouter();
useHead({ title: () => props.title });
</script>

<template>
  <Pane :title="title" :min="448" grow :collapsible="false">
    <template #actions>
      <Button
        variant="ghost"
        size="icon-sm"
        :aria-label="t('common.close')"
        @click="router.push(back)"
      >
        <Icon name="x" />
      </Button>
    </template>
    <div
      class="mx-auto flex w-full flex-col gap-6 px-6 pt-10 pb-8 sm:px-8"
      :class="wide ? 'max-w-3xl' : 'max-w-2xl'"
    >
      <header>
        <p class="text-muted-foreground text-xs">{{ kind }}</p>
        <h1 class="mt-2 text-3xl font-semibold tracking-tight break-words">{{ title }}</h1>
        <p v-if="subtitle" class="text-muted-foreground mt-2 text-sm">{{ subtitle }}</p>
      </header>
      <slot />
    </div>
  </Pane>
</template>
