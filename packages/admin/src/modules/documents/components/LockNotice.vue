<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { Button } from "@/shared/components/ui/button";
import {
  Item,
  ItemContent,
  ItemTitle,
  ItemMedia,
  ItemDescription,
  ItemActions,
} from "@/shared/components/ui/item";
import Icon from "@/shared/components/Icon.vue";

// `holder`: the user who holds the edit lock. `lost`: they took it over from this user.
defineProps<{ holder: { name: string }; lost: boolean }>();
const emit = defineEmits<{ takeover: [] }>();
const { t } = useI18n();
</script>

<template>
  <Item variant="outline" class="mt-4 border-amber-500/30 bg-amber-500/10">
    <ItemMedia
      variant="icon"
      class="size-10 rounded-[6px] border border-amber-500/30 bg-amber-500/10 text-amber-600 dark:border-amber-500/30 dark:bg-amber-500/5 dark:text-amber-500"
    >
      <Icon name="circle-alert" class="text-base" />
    </ItemMedia>
    <ItemContent>
      <ItemTitle>{{ t("documents.conflictHeadline") }}</ItemTitle>
      <ItemDescription>
        {{
          t(lost ? "documents.lockLost" : "documents.lockedBy", {
            name: holder.name || t("documents.someone"),
          })
        }}
      </ItemDescription>
    </ItemContent>
    <ItemActions>
      <Button size="sm" class="bg-amber-600 dark:bg-amber-500" @click="emit('takeover')">
        {{ t("documents.takeOver") }}
      </Button>
    </ItemActions>
  </Item>
</template>
