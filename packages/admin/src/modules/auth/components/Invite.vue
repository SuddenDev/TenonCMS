<script setup lang="ts">
import { useHead } from "@unhead/vue";
import { computed, inject, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { RouterLink, useRoute, useRouter } from "vue-router";
import type { Text } from "../../../../../core/src/admin/index.d.ts";
import { client, CmsError } from "@/shared/api";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { text } from "@/shared/i18n";
import { sessionKey } from "@/shared/options";
import AuthCard from "./AuthCard.vue";
import PasswordInput from "./PasswordInput.vue";

const route = useRoute();
const router = useRouter();
const session = inject(sessionKey)!;
const { t } = useI18n();
// Read once: the address loses the token after the account exists.
const token = typeof route.query.token === "string" ? route.query.token : "";
const invite = ref<{ email: string; label: Text }>();
const invalid = ref(!token);
const name = ref("");
const password = ref("");
const error = ref("");
const busy = ref(false);

useHead({
  title: () => t("auth.invite.title"),
  meta: [{ name: "referrer", content: "no-referrer" }],
});

onMounted(async () => {
  if (!token) return;
  try {
    invite.value = await client.invites.check(token);
  } catch {
    invalid.value = true;
  }
});

const description = computed(() =>
  invite.value ? t("auth.invite.description", { role: text(invite.value.label) }) : "",
);

// The first field error of a 400, else the error's own message.
function message(e: Error) {
  const errors = e instanceof CmsError ? e.body?.errors : undefined;
  return errors ? String(Object.values(errors)[0]) : e.message;
}

async function submit() {
  if (busy.value) return;
  error.value = "";
  busy.value = true;
  try {
    await client.invites.accept({ token, name: name.value, password: password.value });
    await router.replace({ query: {} });
    await session.load();
    await router.replace("/");
  } catch (e) {
    if (e instanceof CmsError && e.status === 404) invalid.value = true;
    else error.value = message(e as Error);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <AuthCard :title="t('auth.invite.title')" :description="description" :heading="true">
    <template v-if="invalid">
      <p role="alert" class="text-destructive text-sm">{{ t("auth.invite.invalid") }}</p>
      <Button as-child variant="link" size="xs">
        <RouterLink to="/login">{{ t("auth.backToSignIn") }}</RouterLink>
      </Button>
    </template>
    <form v-else-if="invite" class="flex flex-col gap-3" :aria-busy="busy" @submit.prevent="submit">
      <fieldset :disabled="busy" class="flex flex-col gap-3">
        <label class="flex flex-col gap-1 text-sm">
          {{ t("auth.email") }}
          <Input
            :model-value="invite.email"
            type="email"
            name="email"
            autocomplete="username"
            readonly
          />
        </label>
        <label class="flex flex-col gap-1 text-sm">
          {{ t("auth.name") }}
          <Input
            v-model="name"
            name="name"
            autocomplete="name"
            :placeholder="t('auth.namePlaceholder')"
            required
          />
        </label>
        <label class="flex flex-col gap-1 text-sm">
          {{ t("auth.password") }}
          <PasswordInput
            v-model="password"
            variant="register"
            name="password"
            autocomplete="new-password"
            required
            minlength="8"
          />
        </label>
        <p v-if="error" role="alert" class="text-destructive text-sm">{{ error }}</p>
        <Button type="submit" size="lg" :disabled="busy">
          {{ t(busy ? "auth.pleaseWait" : "auth.invite.accept") }}
        </Button>
      </fieldset>
    </form>
  </AuthCard>
</template>
