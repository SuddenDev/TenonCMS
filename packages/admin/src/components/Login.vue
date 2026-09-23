<script setup lang="ts">
import { ref } from "vue";
import { client } from "../api";
import { Button } from "./ui/button";

const emit = defineEmits<{ done: [] }>();
const signUp = ref(false);
const form = ref({ name: "", email: "", password: "" });
const error = ref("");
const busy = ref(false);

async function submit() {
  busy.value = true;
  error.value = "";
  try {
    await (signUp.value
      ? client.signUp(form.value)
      : client.signIn(form.value));
    emit("done");
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div
    class="flex min-h-screen items-center justify-center bg-zinc-50 p-4 text-zinc-900"
  >
    <form
      class="flex w-full max-w-sm flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-6"
      @submit.prevent="submit"
    >
      <h1 class="text-lg font-semibold">
        {{ signUp ? "Create the first admin" : "Sign in" }}
      </h1>
      <label v-if="signUp" class="flex flex-col gap-1 text-sm">
        Name
        <input v-model="form.name" class="input" required autocomplete="name" />
      </label>
      <label class="flex flex-col gap-1 text-sm">
        Email
        <input
          v-model="form.email"
          type="email"
          class="input"
          required
          autocomplete="email"
        />
      </label>
      <label class="flex flex-col gap-1 text-sm">
        Password
        <input
          v-model="form.password"
          type="password"
          class="input"
          required
          minlength="8"
          :autocomplete="signUp ? 'new-password' : 'current-password'"
        />
      </label>
      <p v-if="error" role="alert" class="text-sm text-red-600">{{ error }}</p>
      <Button size="lg" :disabled="busy">
        {{ signUp ? "Create account" : "Sign in" }}
      </Button>
      <Button
        variant="link"
        size="xs"
        type="button"
        class="opacity-80"
        @click="signUp = !signUp"
      >
        {{
          signUp
            ? "I already have an account"
            : "First time? Create the admin account"
        }}
      </Button>
    </form>
  </div>
</template>
