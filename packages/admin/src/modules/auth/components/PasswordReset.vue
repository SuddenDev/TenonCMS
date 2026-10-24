<script setup lang="ts">
import { useHead } from "@unhead/vue";
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { RouterLink, useRoute, useRouter } from "vue-router";
import { client, CmsError } from "@/shared/api";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import AuthCard from "./AuthCard.vue";
import PasswordInput from "./PasswordInput.vue";

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const resetting = computed(() => route.path === "/reset-password");
const token = computed(() => (typeof route.query.token === "string" ? route.query.token : ""));
const invalid = computed(() => resetting.value && (!token.value || route.query.error != null));
const title = computed(() => t(resetting.value ? "auth.resetPassword" : "auth.forgotPassword"));
const email = ref("");
const password = ref("");
const confirmation = ref("");
const error = ref("");
const busy = ref(false);
const done = ref(false);
const expired = ref(false);

useHead({ title, meta: [{ name: "referrer", content: "no-referrer" }] });

async function submit() {
  if (busy.value || done.value || invalid.value || expired.value) return;
  error.value = "";
  if (resetting.value && password.value !== confirmation.value) {
    error.value = t("auth.passwordMismatch");
    return;
  }
  busy.value = true;
  try {
    if (resetting.value) {
      await client.resetPassword({ token: token.value, newPassword: password.value });
      done.value = true;
      password.value = confirmation.value = "";
      await router.replace({ path: "/reset-password", query: {} });
    } else {
      const redirectTo = new URL(router.resolve("/reset-password").href, location.origin).href;
      await client.requestPasswordReset({ email: email.value, redirectTo });
      done.value = true;
    }
  } catch (e) {
    const code = e instanceof CmsError ? e.body?.code : undefined;
    if (code === "INVALID_TOKEN") expired.value = true;
    else
      error.value =
        code === "RESET_PASSWORD_DISABLED" ? t("auth.resetUnavailable") : (e as Error).message;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <AuthCard
    :title="title"
    :description="t(resetting ? 'auth.choosePassword' : 'auth.resetInstructions')"
    :heading="true"
  >
    <p
      v-if="done"
      role="status"
      class="-mt-2! rounded-lg bg-green-100 px-3 py-2 text-sm text-green-700 dark:bg-green-950 dark:text-green-400"
    >
      {{ t(resetting ? "auth.passwordReset" : "auth.resetEmailSent") }}
    </p>
    <template v-else-if="invalid || expired">
      <p role="alert" class="text-destructive text-sm">{{ t("auth.invalidResetLink") }}</p>
      <Button as-child variant="link" size="xs">
        <RouterLink to="/forgot-password">{{ t("auth.requestNewLink") }}</RouterLink>
      </Button>
    </template>
    <form v-else class="flex flex-col gap-3" :aria-busy="busy" @submit.prevent="submit">
      <fieldset :disabled="busy" class="flex flex-col gap-3">
        <template v-if="resetting">
          <label class="flex flex-col gap-1 text-sm">
            {{ t("auth.newPassword") }}
            <PasswordInput
              v-model="password"
              variant="register"
              name="newPassword"
              autocomplete="new-password"
              required
              minlength="8"
            />
          </label>
          <label class="flex flex-col gap-1 text-sm">
            {{ t("auth.confirmPassword") }}
            <PasswordInput
              v-model="confirmation"
              name="confirmPassword"
              autocomplete="new-password"
              required
              minlength="8"
            />
          </label>
        </template>
        <label v-else class="flex flex-col gap-1 text-sm">
          {{ t("auth.email") }}
          <Input v-model="email" type="email" name="email" autocomplete="email" required />
        </label>
        <p v-if="error" role="alert" class="text-destructive text-sm">{{ error }}</p>
        <Button type="submit" size="lg" :disabled="busy">
          {{
            t(busy ? "auth.pleaseWait" : resetting ? "auth.resetPassword" : "auth.sendResetLink")
          }}
        </Button>
      </fieldset>
    </form>
    <div class="pt-3 text-center">
      <Button
        as-child
        variant="ghost"
        size="sm"
        class="text-muted-foreground hover:text-foreground"
      >
        <RouterLink to="/login">
          {{ t("auth.backToSignIn") }}
        </RouterLink>
      </Button>
    </div>
  </AuthCard>
</template>
