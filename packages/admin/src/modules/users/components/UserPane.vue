<script setup lang="ts">
import { useHead } from "@unhead/vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import { Icon, Pane } from "@/shared";
import { Button } from "@/shared/components/ui/button";

// The pane next to the Users list, laid out like a document pane. `kind` sits above the title.
const props = defineProps<{ title: string; kind: string; subtitle?: string }>();
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
        @click="router.push('/users')"
      >
        <Icon name="x" />
      </Button>
    </template>
    <div class="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 pt-10 pb-8 sm:px-8">
      <header>
        <p class="text-muted-foreground text-xs">{{ kind }}</p>
        <h1 class="mt-2 text-3xl font-semibold tracking-tight break-words">{{ title }}</h1>
        <p v-if="subtitle" class="text-muted-foreground mt-2 text-sm">{{ subtitle }}</p>
      </header>
      <slot />
    </div>
  </Pane>
</template>
