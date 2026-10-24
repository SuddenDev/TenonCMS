<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import Icon from "@/shared/components/Icon.vue";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@/shared/components/ui/item";
import { addPasskey, cancelled, listPasskeys, removePasskey, type Passkey } from "../passkey";

const { t, locale } = useI18n();
const passkeys = ref<Passkey[]>([]);
const name = ref("");
const error = ref("");
const busy = ref(false);

async function run(action: () => Promise<unknown>) {
  if (busy.value) return;
  busy.value = true;
  error.value = "";
  try {
    await action();
    passkeys.value = await listPasskeys();
  } catch (e) {
    if (!cancelled(e)) error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}

onMounted(() => run(async () => {}));

const add = () =>
  run(async () => {
    await addPasskey(name.value.trim() || undefined);
    name.value = "";
  });

const remove = (p: Passkey) => {
  if (!confirm(t("auth.removePasskeyConfirm", { name: p.name || t("auth.passkey") }))) return;
  run(() => removePasskey(p.id));
};

const date = (iso: string) =>
  new Date(iso).toLocaleDateString(locale.value, { dateStyle: "medium" });
</script>

<template>
  <div class="grid gap-3">
    <ItemGroup v-if="passkeys.length" class="gap-2">
      <Item v-for="p in passkeys" :key="p.id" variant="outline" size="sm">
        <ItemContent>
          <ItemTitle>{{ p.name || t("auth.passkey") }}</ItemTitle>
          <ItemDescription>{{ t("auth.addedOn", { date: date(p.createdAt) }) }}</ItemDescription>
        </ItemContent>
        <ItemActions>
          <Button
            variant="ghost"
            size="icon-sm"
            :disabled="busy"
            :aria-label="t('auth.removePasskey', { name: p.name || t('auth.passkey') })"
            @click="remove(p)"
          >
            <Icon name="trash-2" />
          </Button>
        </ItemActions>
      </Item>
    </ItemGroup>
    <p v-else-if="!busy" class="text-muted-foreground text-sm">{{ t("auth.noPasskeys") }}</p>
    <form class="flex gap-2" @submit.prevent="add">
      <Input
        v-model="name"
        :placeholder="t('auth.passkeyName')"
        :aria-label="t('auth.passkeyName')"
      />
      <Button type="submit" variant="outline" size="lg" :disabled="busy">
        <Icon name="plus" />{{ t("auth.addPasskey") }}
      </Button>
    </form>
    <p v-if="error" role="alert" class="text-destructive text-sm">{{ error }}</p>
  </div>
</template>
