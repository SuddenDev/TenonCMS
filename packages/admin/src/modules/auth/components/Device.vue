<script setup lang="ts">
import { useHead } from "@unhead/vue";
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";
import { client, CmsError } from "@/shared/api";
import { Button } from "@/shared/components/ui/button";
import AuthCard from "./AuthCard.vue";

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const userCode = typeof route.query.user_code === "string" ? route.query.user_code : "";
const state = ref<"loading" | "ready" | "approved" | "denied" | "invalid">("loading");
const email = ref("");
const busy = ref(false);
const error = ref("");

useHead({ title: () => t("auth.device.title") });

// Signs in first and comes back with the code. Claiming the code ties it to this user, so only they can approve it.
onMounted(async () => {
  const session = await client.getSession();
  if (!session) {
    await router.replace({ path: "/login", query: { redirect: route.fullPath } });
    return;
  }
  email.value = session.user.email;
  try {
    if (!userCode) throw new Error("missing code");
    await client.device.verify(userCode);
    state.value = "ready";
  } catch {
    state.value = "invalid";
  }
});

async function answer(approve: boolean) {
  if (busy.value) return;
  busy.value = true;
  error.value = "";
  try {
    await (approve ? client.device.approve(userCode) : client.device.deny(userCode));
    state.value = approve ? "approved" : "denied";
  } catch (e) {
    const body = e instanceof CmsError ? (e.body as { error_description?: string }) : undefined;
    error.value = body?.error_description ?? (e as Error).message;
  } finally {
    busy.value = false;
  }
}

const description = computed(() =>
  state.value === "ready" ? t("auth.device.description", { email: email.value }) : "",
);
</script>

<template>
  <AuthCard :title="t('auth.device.title')" :description="description" :heading="true">
    <p v-if="state === 'invalid'" role="alert" class="text-destructive text-sm">
      {{ t("auth.device.invalid") }}
    </p>
    <p v-else-if="state === 'approved'" role="status" class="text-sm">
      {{ t("auth.device.approved") }}
    </p>
    <p v-else-if="state === 'denied'" role="status" class="text-sm">
      {{ t("auth.device.denied") }}
    </p>
    <div v-else-if="state === 'ready'" class="flex flex-col gap-3" :aria-busy="busy">
      <p class="text-muted-foreground text-sm">{{ t("auth.device.code") }}</p>
      <p class="bg-muted rounded-md py-3 text-center font-mono text-2xl tracking-widest">
        {{ userCode }}
      </p>
      <p v-if="error" role="alert" class="text-destructive text-sm">{{ error }}</p>
      <Button size="lg" :disabled="busy" @click="answer(true)">
        {{ t(busy ? "auth.pleaseWait" : "auth.device.approve") }}
      </Button>
      <Button variant="outline" size="lg" :disabled="busy" @click="answer(false)">
        {{ t("auth.device.deny") }}
      </Button>
    </div>
  </AuthCard>
</template>
