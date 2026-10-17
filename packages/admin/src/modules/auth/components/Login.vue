<script setup lang="ts">
import { useHead } from "@unhead/vue";
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { client } from "@/shared/api";
import Themed from "@/shared/components/Themed.vue";
import { Button } from "@/shared/components/ui/button";
import { useBrand } from "@/shared/composables/useBrand";
import { Input } from "@/shared/components/ui/input";

const { name, logo, icon } = useBrand();
const emit = defineEmits<{ done: [] }>();
const signUp = ref(false);
const form = ref({ name: "", email: "", password: "" });
const error = ref("");
const busy = ref(false);

const { t } = useI18n();
useHead({ title: () => t(signUp.value ? "auth.createAccount" : "auth.signIn") });

async function submit() {
  busy.value = true;
  error.value = "";
  try {
    await (signUp.value ? client.signUp(form.value) : client.signIn(form.value));
    emit("done");
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="bg-muted text-foreground flex min-h-screen items-center justify-center p-4">
    <form
      class="border-border bg-card flex w-full max-w-sm flex-col gap-3 rounded-lg border p-6"
      @submit.prevent="submit"
    >
      <Themed
        v-if="logo ?? icon"
        :src="(logo ?? icon)!"
        :alt="name"
        class="h-10 self-start object-contain"
      />
      <h1 class="text-lg font-semibold">
        {{ t(signUp ? "auth.createFirstAdmin" : "auth.signIn") }}
      </h1>
      <label v-if="signUp" class="flex flex-col gap-1 text-sm">
        {{ t("auth.name") }}
        <Input v-model="form.name" required autocomplete="name" />
      </label>
      <label class="flex flex-col gap-1 text-sm">
        {{ t("auth.email") }}
        <Input v-model="form.email" type="email" required autocomplete="email" />
      </label>
      <label class="flex flex-col gap-1 text-sm">
        {{ t("auth.password") }}
        <Input
          v-model="form.password"
          type="password"
          required
          minlength="8"
          :autocomplete="signUp ? 'new-password' : 'current-password'"
        />
      </label>
      <p v-if="error" role="alert" class="text-sm text-red-600">{{ error }}</p>
      <Button size="lg" :disabled="busy">
        {{ t(signUp ? "auth.createAccount" : "auth.signIn") }}
      </Button>
      <Button variant="link" size="xs" type="button" class="opacity-80" @click="signUp = !signUp">
        {{ t(signUp ? "auth.haveAccount" : "auth.firstTime") }}
      </Button>
    </form>
  </div>
</template>
