<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { Button } from "@/shared/components/ui/button";
import {
  Item,
  ItemContent,
  ItemTitle,
  ItemDescription,
  ItemActions,
} from "@/shared/components/ui/item";

// `holder`: the user who holds the edit lock. `lost`: they took it over from this user.
defineProps<{ holder: { name: string }; lost: boolean }>();
const emit = defineEmits<{ takeover: [] }>();
const { t } = useI18n();
</script>

<template>
  <Item variant="outline" class="mt-4 border-amber-500/30 bg-amber-500/10">
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
